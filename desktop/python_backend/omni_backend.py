import argparse
import os
import runpy
import sys
from pathlib import Path


def parse_args():
    p = argparse.ArgumentParser(add_help=True)
    p.add_argument("--setup-resources", action="store_true")
    p.add_argument("--output-dir", default="")
    return p.parse_known_args()


def log(level, module, message):
    sys.stdout.write(f"[{level}] [{module}] {message}\n")
    sys.stdout.flush()


def setup_resources():
    resources_dir = Path(os.environ.get("OMNI_RESOURCES_DIR", "")).expanduser()
    pw_dir = Path(os.environ.get("PLAYWRIGHT_BROWSERS_PATH", "")).expanduser()
    models_dir = Path(os.environ.get("OMNI_MODELS_DIR", "")).expanduser()

    resources_dir.mkdir(parents=True, exist_ok=True)
    if pw_dir:
        pw_dir.mkdir(parents=True, exist_ok=True)
    if models_dir:
        models_dir.mkdir(parents=True, exist_ok=True)

    log("PROGRESS", "resources", "10% 检查环境")
    try:
        import playwright  # noqa: F401
        log("PROGRESS", "resources", "40% 安装 Playwright 浏览器")
        cmd = [sys.executable, "-m", "playwright", "install", "chromium"]
        env = dict(os.environ)
        if pw_dir:
            env["PLAYWRIGHT_BROWSERS_PATH"] = str(pw_dir)
        rc = os.spawnve(os.P_WAIT, sys.executable, cmd, env)
        if rc != 0:
            log("WARN", "resources", "playwright_install_failed")
    except Exception:
        log("WARN", "resources", "playwright_not_available")

    log("PROGRESS", "resources", "80% 准备模型目录")
    if models_dir:
        (models_dir / ".ready").write_text("ok", encoding="utf-8")

    log("PROGRESS", "resources", "100% 完成")
    return 0


def resolve_mediacrawler_entry():
    entry = os.environ.get("MEDIA_CRAWLER_ENTRY", "").strip()
    if entry:
        return Path(entry).expanduser().resolve()
    src = os.environ.get("MEDIA_CRAWLER_SRC", "").strip()
    if src:
        return Path(src).expanduser().resolve() / "main.py"
    here = Path(__file__).resolve()
    meipass = getattr(sys, "_MEIPASS", "")
    if meipass:
        return Path(meipass) / "MediaCrawler" / "main.py"
    return here.parents[1] / "vendor" / "MediaCrawler" / "main.py"


def run_mediacrawler(argv):
    entry = resolve_mediacrawler_entry()
    if not entry.exists():
        log("ERROR", "backend", "mediacrawler_entry_not_found")
        return 2
    sys.argv = [str(entry)] + argv
    runpy.run_path(str(entry), run_name="__main__")
    return 0


def main():
    args, rest = parse_args()
    if args.setup_resources:
        return setup_resources()
    if args.output_dir:
        os.environ["RESULTS_DIR"] = args.output_dir
    return run_mediacrawler(sys.argv[1:])


if __name__ == "__main__":
    raise SystemExit(main())

