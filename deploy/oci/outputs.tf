output "instance_public_ip" {
  description = "Public IP of the VM. Point your DuckDNS / domain A record here, then set it as API_DOMAIN."
  value       = oci_core_instance.this.public_ip
}

output "ssh_command" {
  description = "Command to SSH into the VM (Ubuntu images log in as the 'ubuntu' user)."
  value       = "ssh -i ${local.private_key_path} ubuntu@${oci_core_instance.this.public_ip}"
}

output "availability_domain" {
  description = "Availability domain the instance landed in."
  value       = oci_core_instance.this.availability_domain
}

output "image_id" {
  description = "OCID of the Ubuntu image selected for the shape."
  value       = data.oci_core_images.ubuntu.images[0].id
}
