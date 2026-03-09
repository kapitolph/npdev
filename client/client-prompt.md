# Dev VPS Client Setup

Agent-readable onboarding instructions. When an agent reads this file, it should walk the developer through each step interactively.

## Instructions for the Agent

You are setting up SSH access and the `npdev` CLI for a shared development VPS. Walk the developer through this step by step, asking for preferences where noted. Do not skip steps or rush ahead — wait for confirmation before proceeding to the next step.

## Context

- **This repo**: You should already be in the `nextpay-dev-vps` repo checkout. If not, clone it first: `git clone https://github.com/kapitolph/nextpay-dev-vps.git && cd nextpay-dev-vps`
- **VPS registry**: `machines.yaml` lists all VPS instances (name, host, user)
- **Shared user**: All developers SSH as the same user (defined per-machine) for pair programming via shared tmux sessions
- **Session system**: The VPS runs a tmux session manager. When two people connect to the same named session, they share the exact same terminal — this enables live pair programming.
- **CLI**: `npdev` is the local client for managing VPS sessions

## Step 1: SSH Key

First, check if I already have SSH key pairs (`~/.ssh/id_ed25519.pub`, `~/.ssh/vps/id_vps_ed25519.pub`, or similar). If I do, ask whether I want to reuse an existing key or generate a dedicated one for this VPS.

If generating a new key:
1. Create the directory: `mkdir -p ~/.ssh/vps && chmod 700 ~/.ssh/vps`
2. Ask me for my **email address** (suggest `firstname@nextfinancial.io` as the format)
3. Generate with: `ssh-keygen -t ed25519 -C "<my-email>" -f ~/.ssh/vps/id_vps_ed25519`
   - **Default to using a passphrase** for security. Let me choose the passphrase interactively.
   - After generation, check if an ssh-agent is running (`ssh-add -l 2>/dev/null`). If not, start one (`eval $(ssh-agent -s)`).
   - Add the key to the agent: `ssh-add ~/.ssh/vps/id_vps_ed25519`
   - On macOS, for persistent keychain integration: `ssh-add --apple-use-keychain ~/.ssh/vps/id_vps_ed25519`

After the key is ready, print the full public key contents.

## Step 2: SSH Config

Read the `machines.yaml` file in this repo to get the VPS host and user details. For each machine, create an SSH config entry.

Before modifying `~/.ssh/config`:
- If the file doesn't exist, create it with `touch ~/.ssh/config && chmod 600 ~/.ssh/config`
- If it already contains an entry for the machine, show it and ask if I want to replace it

For each machine in `machines.yaml`, add a host entry like:

```
Host np-dev-1
  HostName <host from machines.yaml>
  User <user from machines.yaml>
  IdentityFile ~/.ssh/vps/id_vps_ed25519
  IdentitiesOnly yes
  ServerAliveInterval 60
  ServerAliveCountMax 3
```

Also add the VPS host key to known_hosts:

```bash
ssh-keyscan -t ed25519 -H <host> >> ~/.ssh/known_hosts 2>/dev/null
```

## Step 3: Install npdev CLI

Run the client installer from the repo:

```bash
bash client/setup.sh
```

This creates `~/.npdev/config` and symlinks the `npdev` CLI to `~/.local/bin/npdev`.

If `~/.local/bin` is not in your PATH, the script will tell you how to add it.

## Step 4: Test Connection

**Pause here.** Tell me:

> "Your public key needs to be added to the VPS. Either commit it to `keys/<your-name>.pub` and have an admin re-run `server/setup.sh`, or ask the admin to add it manually. Once confirmed, tell me and I'll test the connection."

Once I confirm, test:

```bash
npdev list
```

If the connection times out or is refused, suggest:
- Verify the VPS is running
- Check if a firewall or corporate VPN is blocking port 22
- Confirm the key was added to the server's `authorized_keys`
- If using a passphrase, ensure the key is loaded: `ssh-add -l`

## Step 5: Commit Public Key

Copy the public key into the repo so it's tracked and future `server/setup.sh` runs import it automatically.

Ask the developer for the filename to use (suggest their first name, lowercase). Then copy whichever public key was used in Step 1:

```bash
cp <path-to-public-key-from-step-1> keys/<name>.pub
git add keys/<name>.pub
git commit -m "chore: add <name> SSH public key"
git push
```

## Summary

After completing all steps, print a concise summary:

```
✓ SSH key:      ~/.ssh/vps/id_vps_ed25519
✓ SSH config:   Host entries for all machines in machines.yaml
✓ npdev CLI:    installed at ~/.local/bin/npdev
✓ Connection:   Tested OK
✓ Public key:   Committed to keys/<name>.pub

Quick reference:
  npdev                     → Quick shell on VPS
  npdev my-session          → Create/join tmux session (pair programming!)
  npdev list                → Show all sessions
  npdev end my-session      → Kill a session
  Ctrl+B, D                 → Detach (session stays alive)
```

## Cleanup (Optional)

If a developer ever needs to remove this setup:
- Delete SSH key: `rm -rf ~/.ssh/vps/`
- Remove host entries from `~/.ssh/config`
- Remove config: `rm -rf ~/.npdev/`
- Remove symlink: `rm ~/.local/bin/npdev`
- Remove the host key: `ssh-keygen -R <host>`
