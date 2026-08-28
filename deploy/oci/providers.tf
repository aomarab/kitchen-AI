# Browser-based session-token auth: run `oci session authenticate` once (it opens
# a browser, you log in with YOUR own Oracle credentials, and it writes a
# short-lived token into ~/.oci/config). No API keys, no password stored here.
provider "oci" {
  auth                = "SecurityToken"
  config_file_profile = var.config_file_profile
  region              = var.region
}
