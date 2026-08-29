output "instance_public_ip" {
  description = "Public IP of the VM. Point your DuckDNS / domain A record here, then set it as API_DOMAIN."
  value       = azurerm_public_ip.this.ip_address
}

output "ssh_command" {
  description = "Command to SSH into the VM."
  value       = "ssh -i ${local.private_key_path} ${var.admin_username}@${azurerm_public_ip.this.ip_address}"
}

output "resource_group" {
  description = "Resource group holding everything (delete it to tear the deployment down)."
  value       = azurerm_resource_group.this.name
}
