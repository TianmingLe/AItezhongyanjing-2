import argparse
import signal
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", default="dy")
    parser.add_argument("--pipeline", default="mvp")
    parser.add_argument("--specified_id", default="test")
    parser.add_argument("--crash", action="store_true")
    args, _ = parser.parse_known_args()

    stopping = {"v": False}

    def on_term(_sig, _frame):
        stopping["v"] = True
        print("[SUCCESS] [mock] received SIGTERM, exiting", flush=True)
        sys.exit(0)

    signal.signal(signal.SIGTERM, on_term)

    print(f"[INFO] [mock] start platform={args.platform} pipeline={args.pipeline} specified_id={args.specified_id}", flush=True)

    for i in range(1, 50):
        if stopping["v"]:
            break
        if args.crash and i == 5:
            print("[ERROR] [mock] crash requested", file=sys.stderr, flush=True)
            sys.exit(2)
        print(f"[PROGRESS] [mock] tick={i}", flush=True)
        time.sleep(0.4)

    print("[SUCCESS] [mock] finished", flush=True)


if __name__ == "__main__":
    main()

