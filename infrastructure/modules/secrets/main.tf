# Shared token between the mutations Lambda and the private GraphQL server.
# - Lambda reads it at runtime with secretsmanager:GetSecretValue (scoped to this ARN only).
# - ECS injects it into the container as an env var via the task definition "secrets" block.
# The database password is NOT here: RDS manages and rotates it itself (see modules/rds).

resource "random_password" "internal_token" {
  length  = 48
  special = false
}

resource "aws_secretsmanager_secret" "internal_token" {
  name_prefix             = "${var.name}/internal-api-token-"
  description             = "Shared token: mutations Lambda -> private GraphQL server"
  recovery_window_in_days = var.recovery_window_in_days
}

resource "aws_secretsmanager_secret_version" "internal_token" {
  secret_id     = aws_secretsmanager_secret.internal_token.id
  secret_string = random_password.internal_token.result
}
