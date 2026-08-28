data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

# Filtering by shape returns the correct architecture automatically:
# aarch64 Ubuntu for A1.Flex, x86_64 for the AMD micro shape.
data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = var.ubuntu_version
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

locals {
  is_flex          = length(regexall("Flex$", var.instance_shape)) > 0
  private_key_path = replace(var.ssh_public_key_path, ".pub", "")
  # Reuse the hands-off first-boot script (installs Docker, opens the OS
  # firewall, clones the repo) so the VM is ready without manual bootstrap.
  user_data = base64encode(file("${path.module}/../cloud-init.yaml"))
}

resource "oci_core_instance" "this" {
  compartment_id      = var.compartment_ocid
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
  display_name        = var.instance_name
  shape               = var.instance_shape

  dynamic "shape_config" {
    for_each = local.is_flex ? [1] : []
    content {
      ocpus         = var.instance_ocpus
      memory_in_gbs = var.instance_memory_gbs
    }
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.this.id
    assign_public_ip = true
    display_name     = "${var.instance_name}-vnic"
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_gbs
  }

  metadata = {
    ssh_authorized_keys = file(pathexpand(var.ssh_public_key_path))
    user_data           = local.user_data
  }
}
