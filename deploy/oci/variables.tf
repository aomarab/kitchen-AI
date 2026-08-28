variable "region" {
  description = "OCI region identifier, e.g. me-jeddah-1 or us-ashburn-1 (shown in the console's Profile menu)."
  type        = string
}

variable "tenancy_ocid" {
  description = "Your tenancy OCID (console Profile menu -> Tenancy)."
  type        = string
}

variable "compartment_ocid" {
  description = "Compartment to create resources in. Use the tenancy OCID for the root compartment."
  type        = string
}

variable "config_file_profile" {
  description = "Profile name in ~/.oci/config to authenticate with (created by `oci session authenticate`)."
  type        = string
  default     = "DEFAULT"
}

variable "ssh_public_key_path" {
  description = "Path to the SSH PUBLIC key placed on the VM. The matching private key logs you in."
  type        = string
  default     = "~/.ssh/kitchen-ai-oracle.pub"
}

variable "ssh_ingress_cidr" {
  description = "CIDR allowed to reach SSH (port 22). Tighten to <your-ip>/32 for less exposure; 0.0.0.0/0 allows anywhere."
  type        = string
  default     = "0.0.0.0/0"
}

variable "instance_name" {
  description = "Display name / DNS host label base for the VM and its network resources."
  type        = string
  default     = "kitchen-ai"
}

variable "instance_shape" {
  description = "Compute shape. VM.Standard.A1.Flex (ARM, roomiest free) or VM.Standard.E2.1.Micro (AMD, always available)."
  type        = string
  default     = "VM.Standard.A1.Flex"
}

variable "instance_ocpus" {
  description = "OCPUs (Flex shapes only). Always Free A1 allows up to 4 OCPUs total across instances."
  type        = number
  default     = 2
}

variable "instance_memory_gbs" {
  description = "Memory in GB (Flex shapes only). Always Free A1 allows up to 24 GB total across instances."
  type        = number
  default     = 12
}

variable "boot_volume_gbs" {
  description = "Boot volume size in GB. Always Free includes up to 200 GB of block storage total."
  type        = number
  default     = 50
}

variable "availability_domain_index" {
  description = "Which availability domain to launch in (0-based). Try 1 or 2 if A1 reports 'out of capacity'."
  type        = number
  default     = 0
}

variable "ubuntu_version" {
  description = "Canonical Ubuntu version to launch (must be an image Oracle publishes for the chosen shape)."
  type        = string
  default     = "22.04"
}
