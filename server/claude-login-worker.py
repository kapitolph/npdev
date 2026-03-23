#!/usr/bin/env python3
"""
Worker for claude-login-proxy.sh — runs `claude auth login` inside a PTY
using pexpect. Captures the OAuth URL and waits for the process to complete
(claude polls the server automatically after the user authenticates in browser).

Usage: claude-login-worker.py <sess_dir> [email]
"""

import os
import sys
import time

import pexpect

TIMEOUT = 600  # 10 minute timeout for the entire flow


def main():
    sess_dir = sys.argv[1]
    email = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None

    output_log = os.path.join(sess_dir, "output.log")
    url_file = os.path.join(sess_dir, "url.txt")
    status_file = os.path.join(sess_dir, "worker_status")

    # Build the command
    args = ["auth", "login"]
    if email:
        args.extend(["--email", email])

    log_fh = open(output_log, "wb")

    try:
        # Spawn with PTY so claude behaves as if in an interactive terminal
        child = pexpect.spawn("claude", args, timeout=TIMEOUT, env=dict(os.environ))
        child.logfile_read = log_fh

        # Wait for the URL to appear in output
        url_pattern = r"(https?://claude\.ai/oauth/authorize\S+)"
        idx = child.expect([url_pattern, pexpect.EOF, pexpect.TIMEOUT], timeout=30)

        if idx == 0:
            url = child.match.group(1).decode("utf-8", errors="replace")
            with open(url_file, "w") as f:
                f.write(url)
        else:
            with open(status_file, "w") as f:
                f.write("error")
            return

        # Wait for claude to finish (it polls the server for auth completion)
        child.expect([pexpect.EOF, pexpect.TIMEOUT], timeout=TIMEOUT)
        child.close()

        with open(status_file, "w") as f:
            f.write("done")

    except Exception as e:
        with open(output_log, "a") as f:
            f.write(f"\nProxy error: {e}\n")
        with open(status_file, "w") as f:
            f.write("error")
    finally:
        log_fh.close()


if __name__ == "__main__":
    main()
