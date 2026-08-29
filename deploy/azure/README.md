# Provision the VM on Azure with Terraform

Azure equivalent of `../oci` — provisions a VM + network + firewall rules for
**22 / 80 / 443** in one `terraform apply`. You authenticate with your own
`az login`; no secrets are stored in this repo.

> **Cost warning.** Unlike Oracle A1 (free forever), **Azure has no permanent
> free VM.** `Standard_B1s` is free for 12 months on a _free_ account (then
> billable); the default `Standard_B2s` is **billable from day one** (~$30/mo).
> `terraform plan` and the Azure Pricing Calculator show the exact cost before
> you apply. If $0-forever matters, prefer `../oci`.

What it creates (in one resource group you can delete to remove everything):

- resource group + virtual network + subnet
- network security group opening 22 (SSH), 80 (ACME), 443 (HTTPS)
- static public IP + NIC
- one Ubuntu 22.04 Linux VM with your SSH key and `../cloud-init.yaml` as
  `custom_data` (installs Docker, opens the OS firewall, clones the repo)

## Prerequisites

1. An **active Azure subscription** (you have one).
2. **Terraform** ≥ 1.5 and the **Azure CLI**:
   ```bash
   brew install hashicorp/tap/terraform
   brew install azure-cli
   ```
3. **An SSH keypair.** One was generated at `~/.ssh/kitchen-ai-oracle`(.pub);
   reuse it or point `ssh_public_key_path` at your own.

## 1. Authenticate (browser, your login)

```bash
az login                                   # opens your browser
az account show --query id -o tsv          # copy this into subscription_id
# if you have several: az account set --subscription <id>
```

## 2. Fill in variables

```bash
cd deploy/azure
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars    # subscription_id, location, ssh key path
```

## 3. Plan and apply

```bash
terraform init
terraform plan       # review resources AND cost implications
terraform apply
```

It prints:

```
instance_public_ip = "20.x.x.x"
ssh_command        = "ssh -i ~/.ssh/kitchen-ai-oracle azureuser@20.x.x.x"
resource_group     = "kitchen-ai"
```

## 4. Continue the launch

1. Point a hostname at `instance_public_ip` (DuckDNS or your domain `A` record)
   — see `../README.md` step 4.
2. SSH in and finish the app deploy (`../README.md` steps 5–6): `.env`, then
   `docker compose … up -d --build`, then `./deploy/smoke.sh https://<domain>`.

The VM runs `cloud-init.yaml` on first boot, so Docker + the cloned repo may
already be present by the time you SSH in.

## Notes

- **Tear down:** `terraform destroy` (or delete the resource group in the portal)
  removes everything this created — stopping all charges.
- **Sizing:** `Standard_B1s` (1 GB) is tight for Postgres + Redis + API + pgvector;
  `Standard_B2s` (4 GB) or `Standard_B2ms` (8 GB) are more comfortable.
- **State:** `terraform.tfstate`, `terraform.tfvars`, and `.terraform/` are
  gitignored — local to your machine and may reference your subscription.
