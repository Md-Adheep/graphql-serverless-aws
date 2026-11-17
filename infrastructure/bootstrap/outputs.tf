output "tf_state_bucket" {
  description = "Set as GitHub repository variable TF_STATE_BUCKET"
  value       = aws_s3_bucket.tfstate.bucket
}

output "github_deploy_role_arn" {
  description = "Set as GitHub repository variable AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.github_deploy.arn
}
