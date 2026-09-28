#!/usr/bin/env python3
"""Cross-platform local development launcher for the Shift Tracker stack."""
from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import threading
from pathlib import Path
from typing import Sequence
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parent.parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
REQUIRED_BACKEND_KEYS = ("DATABASE_URL", "CLERK_ISSUER")
REQUIRED_FRONTEND_KEYS = ("VITE_CLERK_PUBLISHABLE_KEY",)
SHUTDOWN_TIMEOUT_SECONDS = 8.0


class StartupError(RuntimeError):
    pass


def parse_env_file(path: Path) -> dict[str, str]:
    """Read key/value names and values without ever echoing secrets to stdout."""
    values: dict[str, str] = {}
    if not path.is_file():
        return values
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith(("'", '"')):
            quote = value[0]
            if len(value) >= 2 and value.endswith(quote):
                value = value[1:-1]
        else:
            value = value.split("#", 1)[0].strip()
        if key:
            values[key] = value
    return values


def is_placeholder(value: str) -> bool:
    normalized = value.strip().lower()
    return (
        not normalized
        or "your-clerk-instance" in normalized
        or normalized.startswith("your-")
        or normalized.startswith("replace-")
        or normalized in {"changeme", "change-me", "todo", "placeholder"}
        or "<" in normalized
        or ">" in normalized
    )


def validate_environment() -> dict[str, str]:
    backend_env_path = BACKEND_DIR / ".env"
    frontend_env_path = FRONTEND_DIR / ".env"
    problems: list[str] = []

    if not backend_env_path.is_file():
        problems.append("backend/.env is missing")
    if not frontend_env_path.is_file():
        problems.append("frontend/.env is missing")

    backend_values = parse_env_file(backend_env_path)
    frontend_values = parse_env_file(frontend_env_path)
    for key in REQUIRED_BACKEND_KEYS:
        if is_placeholder(backend_values.get(key, "")):
            problems.append(f"backend/.env needs a non-placeholder {key}")
    for key in REQUIRED_FRONTEND_KEYS:
        if is_placeholder(frontend_values.get(key, "")):
            problems.append(f"frontend/.env needs a non-placeholder {key}")

    database_url = backend_values.get("DATABASE_URL", "")
    if database_url and not database_url.startswith(("postgres://", "postgresql://", "sqlite://")):
        problems.append("backend/.env DATABASE_URL must use PostgreSQL or SQLite")
    issuer = backend_values.get("CLERK_ISSUER", "")
    if issuer and not is_placeholder(issuer):
        parsed_issuer = urlparse(issuer)
        if parsed_issuer.scheme != "https" or not parsed_issuer.netloc:
            problems.append("backend/.env CLERK_ISSUER must be an HTTPS URL")
    publishable_key = frontend_values.get("VITE_CLERK_PUBLISHABLE_KEY", "")
    if publishable_key and not is_placeholder(publishable_key) and not publishable_key.startswith(("pk_test_", "pk_live_")):
        problems.append("frontend/.env VITE_CLERK_PUBLISHABLE_KEY must be a Clerk publishable key")

    if problems:
        for problem in problems:
            print(f"[FAIL] Environment: {problem}")
        raise StartupError("Fix the environment file checks above before starting services.")

    child_env = os.environ.copy()
    for values in (backend_values, frontend_values):
        for key, value in values.items():
            child_env.setdefault(key, value)
    print("[PASS] backend/.env and frontend/.env contain the required configuration keys")
    return child_env


def virtualenv_python() -> Path:
    active_venv = os.environ.get("VIRTUAL_ENV")
    candidates: list[Path] = []
    if active_venv:
        candidates.append(Path(active_venv))
    if sys.prefix != sys.base_prefix:
        candidates.append(Path(sys.prefix))
    candidates.extend(
        (
            BACKEND_DIR / ".venv",
            ROOT_DIR / ".venv",
            BACKEND_DIR / "venv",
            ROOT_DIR / "venv",
        )
    )

    seen: set[Path] = set()
    for environment in candidates:
        try:
            environment = environment.resolve()
        except OSError:
            continue
        if environment in seen or not (environment / "pyvenv.cfg").is_file():
            continue
        seen.add(environment)
        executable = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        if executable.is_file():
            print("[PASS] Python virtual environment found")
            return executable

    raise StartupError(
        "Python virtual environment was not found. Create backend/.venv with "
        "python -m venv backend/.venv, install backend/requirements.txt there, "
        "then rerun this script."
    )


def resolve_npm() -> str:
    candidates = ("npm.cmd", "npm") if os.name == "nt" else ("npm",)
    for candidate in candidates:
        executable = shutil.which(candidate)
        if executable:
            return executable
    raise StartupError("npm was not found on PATH. Install Node.js and npm before starting the frontend.")


def verify_dependencies(python_executable: Path, npm_executable: str) -> None:
    if not (FRONTEND_DIR / "node_modules").is_dir():
        raise StartupError("frontend/node_modules is missing. Run npm install from frontend/ first.")
    print("[PASS] frontend/node_modules exists")

    check_python = subprocess.run(
        [str(python_executable), "-c", "import sys; assert sys.version_info >= (3, 11); import alembic, fastapi, jwt, psycopg2, sqlmodel, uvicorn; import dotenv"],
        cwd=BACKEND_DIR,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
        check=False,
    )
    if check_python.returncode != 0:
        raise StartupError("The selected virtualenv must use Python 3.11+ and contain backend/requirements.txt dependencies.")
    print("[PASS] Python 3.11+ and backend dependencies are available in the virtualenv")
    print(f"[PASS] npm executable found: {Path(npm_executable).name}")


def run_migrations(python_executable: Path, child_env: dict[str, str]) -> None:
    print("[INFO] Applying database migrations (alembic upgrade head)...")
    try:
        subprocess.run(
            [str(python_executable), "-m", "alembic", "upgrade", "head"],
            cwd=BACKEND_DIR,
            env=child_env,
            check=True,
        )
    except subprocess.CalledProcessError as error:
        raise StartupError(f"Database migration failed with exit code {error.returncode}; services were not started.") from error
    print("[PASS] Database schema is at Alembic head")


def spawn_service(command: Sequence[str], cwd: Path, child_env: dict[str, str]) -> subprocess.Popen[bytes]:
    options: dict[str, object] = {"cwd": cwd, "env": child_env}
    if os.name == "nt":
        options["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        options["start_new_session"] = True
    return subprocess.Popen(list(command), **options)  # type: ignore[arg-type]


def stop_service_tree(process: subprocess.Popen[bytes], name: str) -> None:
    if process.poll() is not None:
        return
    try:
        if os.name == "nt":
            process.send_signal(signal.CTRL_BREAK_EVENT)
        else:
            os.killpg(process.pid, signal.SIGTERM)
    except (OSError, ValueError):
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            try:
                process.terminate()
            except OSError:
                pass
    try:
        process.wait(timeout=SHUTDOWN_TIMEOUT_SECONDS)
        print(f"[INFO] Stopped {name}")
        return
    except subprocess.TimeoutExpired:
        pass

    print(f"[WARN] Forcing {name} process-tree shutdown")
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except OSError:
            process.kill()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        process.kill()


def run_services(python_executable: Path, npm_executable: str, child_env: dict[str, str]) -> int:
    services: list[tuple[str, subprocess.Popen[bytes]]] = []
    try:
        backend = spawn_service(
            [str(python_executable), "-m", "uvicorn", "app.main:app", "--reload", "--port", "8000"],
            BACKEND_DIR,
            child_env,
        )
        services.append(("backend", backend))
        frontend = spawn_service(
            [npm_executable, "run", "dev", "--", "--port", "5173"],
            FRONTEND_DIR,
            child_env,
        )
        services.append(("frontend", frontend))

        print("\nShift Tracker development stack is running")
        print("  Backend:  http://localhost:8000")
        print("  Frontend: http://localhost:5173")
        print("Press Ctrl+C to stop both services.\n")

        shutdown_requested = threading.Event()
        previous_handlers: dict[int, object] = {}

        def request_shutdown(signum: int, frame: object) -> None:
            print("\n[INFO] Shutdown requested; stopping child processes...")
            shutdown_requested.set()

        for signum in (signal.SIGINT, getattr(signal, "SIGTERM", signal.SIGINT)):
            if signum not in previous_handlers:
                previous_handlers[signum] = signal.getsignal(signum)
                signal.signal(signum, request_shutdown)
        try:
            while not shutdown_requested.wait(0.25):
                for name, process in services:
                    return_code = process.poll()
                    if return_code is not None:
                        print(f"[FAIL] {name} exited unexpectedly with code {return_code}")
                        return 1 if return_code == 0 else return_code
        finally:
            for signum, handler in previous_handlers.items():
                signal.signal(signum, handler)  # type: ignore[arg-type]
        return 0
    finally:
        for name, process in reversed(services):
            stop_service_tree(process, name)


def main() -> int:
    try:
        child_env = validate_environment()
        python_executable = virtualenv_python()
        npm_executable = resolve_npm()
        verify_dependencies(python_executable, npm_executable)
        run_migrations(python_executable, child_env)
        return run_services(python_executable, npm_executable, child_env)
    except StartupError as error:
        print(f"[FAIL] Startup: {error}", file=sys.stderr)
        return 1
    except (OSError, subprocess.SubprocessError) as error:
        print(f"[FAIL] Startup: unable to launch a required process ({error})", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\n[INFO] Startup interrupted")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
