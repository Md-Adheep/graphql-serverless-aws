output "instance_identifier" {
  value = aws_db_instance.this.identifier
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "username" {
  value = aws_db_instance.this.username
}

output "master_secret_arn" {
  value = aws_db_instance.this.master_user_secret[0].secret_arn
}

output "proxy_name" {
  value = aws_db_proxy.this.name
}

output "proxy_endpoint" {
  value = aws_db_proxy.this.endpoint
}

# rds-db:connect resources use the proxy's resource id, e.g.
#   arn:aws:rds-db:us-east-2:123456789012:dbuser:prx-0abc123def456/app_admin
output "proxy_resource_id" {
  value = element(split(":", aws_db_proxy.this.arn), 6)
}

output "replica_identifier" {
  value = try(aws_db_instance.replica[0].identifier, null)
}
