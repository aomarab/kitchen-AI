# Auth uses YOUR Azure CLI session: run `az login` once (opens your browser,
# your credentials) and select the subscription. No secrets are stored here.
provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}
