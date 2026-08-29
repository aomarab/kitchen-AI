variable "subscription_id" {
  description = "Azure subscription ID to deploy into (`az account show --query id -o tsv`)."
  type        = string
}

variable "location" {
  description = "Azure region, e.g. eastus, westeurope, uaenorth."
  type        = string
  default     = "eastus"
}

variable "resource_group_name" {
  description = "Resource group to create and hold every resource (delete it to remove everything)."
  type        = string
  default     = "kitchen-ai"
}

variable "prefix" {
  description = "Name prefix for the VM and its network resources."
  type        = string
  default     = "kitchen-ai"
}

variable "admin_username" {
  description = "Admin (SSH) username on the VM."
  type        = string
  default     = "azureuser"
}

variable "ssh_public_key_path" {
  description = "Path to the SSH PUBLIC key placed on the VM. The matching private key logs you in."
  type        = string
  default     = "~/.ssh/kitchen-ai-oracle.pub"
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to reach SSH (port 22). Tighten to <your-ip>/32 for less exposure."
  type        = string
  default     = "0.0.0.0/0"
}

variable "vm_size" {
  description = <<-EOT
    VM size. Standard_B2s (2 vCPU / 4 GB) is comfortable for this stack but billable.
    Standard_B1s (1 vCPU / 1 GB) is eligible for the 12-month free tier on a free
    account but tight. Standard_B2ms (2 vCPU / 8 GB) for headroom.
  EOT
  type        = string
  default     = "Standard_B2s"
}

variable "os_disk_gbs" {
  description = "OS disk size in GB."
  type        = number
  default     = 64
}

variable "ubuntu_sku" {
  description = "Canonical Ubuntu 22.04 (jammy) image SKU. 22_04-lts-gen2 (recommended) or 22_04-lts for gen1."
  type        = string
  default     = "22_04-lts-gen2"
}
