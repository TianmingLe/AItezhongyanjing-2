import argparse
import os
import pathlib
import sys
import time


def log(level, module, message):
    sys.stdout.write(f"[{level}] [{module}] {message}\n")
    sys.stdout.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", default="dy")
    parser.add_argument("--pipeline", default="mvp")
    parser.add_argument("--specified_id", default="")
    parser.add_argument("--keyword", default="")
    parser.add_argument("--limit", type=int, default=20)
    parser.add_argument("--ocr-enabled", action="store_true")
    parser.add_argument("--comment-depth", type=int, default=0)
    parser.add_argument("--enable-llm", action="store_true")
    parser.add_argument("--llm-model", default="")
    parser.add_argument("--llm-base-url", default="")
    parser.add_argument("--output-dir", default="")
    parser.add_argument("--setup-resources", action="store_true")
    args, _ = parser.parse_known_args()

    if args.setup_resources:
        log("PROGRESS", "resources", "10% 检查环境")
        time.sleep(0.1)
        log("PROGRESS", "resources", "60% 下载资源")
        time.sleep(0.1)
        log("PROGRESS", "resources", "100% 完成")
        return 0

    out_dir = args.output_dir or os.environ.get("RESULTS_DIR", "")
    if out_dir:
        p = pathlib.Path(out_dir)
        p.mkdir(parents=True, exist_ok=True)
        (p / "mvp_report.md").write_text(
            f"# Report\n\nplatform={args.platform}\nmode={'search' if args.keyword else 'detail'}\n",
            encoding="utf-8",
        )
        (p / "meta.json").write_text(
            '{"note":"generated_by_stub"}',
            encoding="utf-8",
        )

    log("INFO", "crawler", f"start platform={args.platform}")
    time.sleep(0.2)
    log("SUCCESS", "crawler", "done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

