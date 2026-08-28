# Provision the free Oracle VM with Terraform

Automates step 2 of `../README.md` — the Always Free VM **and** the one piece
that cannot be scripted from inside the box: the virtual-network ingress rules
for **22 / 80 / 443**. You authenticate once with your own Oracle login; no API
keys or passwords are stored in this repo.

What it creates (all Always Free):

- a VCN + internet gateway + route table + subnet,
- a security list opening 22 (SSH), 80 (ACME), 443 (HTTPS),
- one compute instance (`VM.Standard.A1.Flex`, 2 OCPU / 12 GB by default) running
  Ubuntu, with your SSH key and `../cloud-init.yaml` as first-boot user-data
  (installs Docker, opens the OS firewall, clones the repo).

## Prerequisites

1. **An Oracle Cloud account already exists.** Creating the account (card + phone
   verification) is the one manual step Terraform can't and shouldn't do.
2. **Terraform** ≥ 1.5 and the **OCI CLI** installed:
   ```bash
   brew install hashicorp/tap/terraform
   brew install oci-cli
   ```
3. **An SSH keypair.** One was generated for you at `~/.ssh/kitchen-ai-oracle`
   (public key `~/.ssh/kitchen-ai-oracle.pub`). Regenerate with:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/kitchen-ai-oracle -C kitchen-ai-oracle
   ```

## 1. Authenticate (browser, your login)

```bash
oci session authenticate --region <your-region>   # e.g. us-ashburn-1
```

This opens a browser; log in with your own Oracle credentials. It writes a
short-lived **session token** to a profile in `~/.oci/config` (default name
`DEFAULT`). Re-run it when the token expires (`oci session refresh`).

## 2. Fill in variables

```bash
cd deploy/oci
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars    # region, tenancy_ocid, compartment_ocid, profile
```

Find your **tenancy OCID** in the console: Profile menu → **Tenancy**. For a
personal account, `compartment_ocid` is the same value (the root compartment).

## 3. Plan and apply

```bash
terraform init
terraform plan       # review — creates ~7 resources, all Always Free
terraform apply
```

On success it prints:

```
instance_public_ip = "129.x.x.x"
ssh_command        = "ssh -i ~/.ssh/kitchen-ai-oracle ubuntu@129.x.x.x"
```

## 4. Continue the launch

1. Point a hostname at `instance_public_ip` (DuckDNS or your domain's `A`
   record) — see `../README.md` step 4.
2. SSH in and finish the app deploy (`../README.md` steps 5–6): `.env`, then
   `docker compose … up -d --build`, then `./deploy/smoke.sh https://<domain>`.

The VM runs `cloud-init.yaml` on first boot, so Docker + the cloned repo may
already be present by the time you SSH in.

## Notes & troubleshooting

- **A1 "out of capacity":** free `A1.Flex` is popular. Bump
  `availability_domain_index` to `1`/`2`, retry later, or switch
  `instance_shape = "VM.Standard.E2.1.Micro"` (AMD, always available, but only
  1 GB RAM — tighter for this stack).
- **Cost:** the defaults sit inside Always Free (≤4 A1 OCPUs, ≤24 GB RAM, ≤200 GB
  block storage). `terraform plan` shows exactly what will be created before you
  commit.
- **Tear down:** `terraform destroy` removes everything this created. Your
  account and any data you backed up off-box (R2) are untouched.
- **State:** `terraform.tfstate`, `terraform.tfvars`, and `.terraform/` are
  gitignored — they are local to your machine and may reference your account.
