import json
import os
import platform
import shutil
import subprocess
import sys
import venv
from pathlib import Path


def run(cmd, cwd=None, env=None):
    p = subprocess.run(cmd, cwd=cwd, env=env, stdout=sys.stdout, stderr=sys.stderr)
    if p.returncode != 0:
        raise SystemExit(p.returncode)


def ensure_venv(venv_dir: Path):
    if (venv_dir / "pyvenv.cfg").exists():
        return
    venv.EnvBuilder(with_pip=True, clear=True).create(venv_dir)


def venv_python(venv_dir: Path) -> Path:
    if os.name == "nt":
        return venv_dir / "Scripts" / "python.exe"
    return venv_dir / "bin" / "python"


def copy_mediacrawler(src: Path, vendor_dst: Path):
    if vendor_dst.exists():
        shutil.rmtree(vendor_dst)
    shutil.copytree(src, vendor_dst)


def main():
    root = Path(__file__).resolve().parents[1]
    vendor_dir = root / "vendor" / "MediaCrawler"
    src_override = os.environ.get("MEDIA_CRAWLER_SRC", "").strip()
    if src_override:
        src_path = Path(src_override).expanduser().resolve()
        if not src_path.exists():
            raise SystemExit("MEDIA_CRAWLER_SRC_not_found")
        vendor_dir.parent.mkdir(parents=True, exist_ok=True)
        copy_mediacrawler(src_path, vendor_dir)
    if not vendor_dir.exists():
        raise SystemExit("vendor_MediaCrawler_not_found")

    backend_entry = root / "python_backend" / "omni_backend.py"
    if not backend_entry.exists():
        raise SystemExit("python_backend_entry_not_found")

    build_root = root / ".python_build"
    venv_dir = build_root / "venv"
    dist_root = root / "python_dist"
    dist_root.mkdir(parents=True, exist_ok=True)

    ensure_venv(venv_dir)
    py = str(venv_python(venv_dir))

    run([py, "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"])
    run([py, "-m", "pip", "install", "pyinstaller"])

    req = vendor_dir / "requirements.txt"
    pyproject = vendor_dir / "pyproject.toml"
    if req.exists():
        run([py, "-m", "pip", "install", "-r", str(req)])
    elif pyproject.exists():
        run([py, "-m", "pip", "install", str(vendor_dir)])

    system = platform.system().lower()
    if system.startswith("darwin"):
        plat = "mac"
    elif system.startswith("windows"):
        plat = "win"
    else:
        plat = "linux"

    out_dir = dist_root / plat
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    sep = ";" if os.name == "nt" else ":"
    add_data = f"{vendor_dir}{sep}MediaCrawler"

    cmd = [
        py,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--onefile",
        "--name",
        "omni-backend",
        "--distpath",
        str(out_dir),
        "--workpath",
        str(build_root / "work"),
        "--specpath",
        str(build_root / "spec"),
        "--add-data",
        add_data,
        str(backend_entry),
    ]
    run(cmd, cwd=str(root))

    meta = {
        "platform": plat,
        "backend": str(next(out_dir.glob("omni-backend*"))),
    }
    (out_dir / "bundle.meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()

