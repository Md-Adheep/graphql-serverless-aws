# -----------------------------------------------------------------------------
# One-time bootstrap (run locally by an admin, uses LOCAL state):
#   * S3 bucket for Terraform remote state (versioned, encrypted, private, native S3 locking)
#   * GitHub Actions OIDC identity provider
#   * IAM role GitHub Actions assumes to deploy - no long-lived AWS keys stored in GitHub
# -----------------------------------------------------------------------------
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = { Project = var.project, ManagedBy = "terraform", Stack = "bootstrap" }
  }
}

data "aws_caller_identity" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  state_bucket = "${var.project}-tfstate-${local.account_id}"
}

# ---------------- Terraform state bucket ----------------
resource "aws_s3_bucket" "tfstate" {
  bucket = local.state_bucket
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "tfstate_tls_only" {
  bucket = aws_s3_bucket.tfstate.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.tfstate.arn, "${aws_s3_bucket.tfstate.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

# ---------------- GitHub OIDC ----------------
# An AWS account can have only ONE provider per URL. In an existing account that already uses
# GitHub Actions OIDC, set create_github_oidc_provider = false to reuse it.
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_github_oidc_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 0 : 1
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_provider_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

data "aws_iam_policy_document" "github_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Only workflows from THIS repo, running on main or in the protected "production"
    # environment, can assume the role. Forks and other branches are rejected.
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:ref:refs/heads/main",
        "repo:${var.github_repository}:environment:production",
      ]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${var.project}-github-deploy"
  description          = "Assumed by GitHub Actions (OIDC) to deploy ${var.project}"
  assume_role_policy   = data.aws_iam_policy_document.github_trust.json
  max_session_duration = 3600
}

# Deploy permissions: limited to the services this project uses, to the project's own
# IAM roles (name prefix), and to the project's regions. See docs/iam-security.md.
data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid    = "ProjectServices"
    effect = "Allow"
    actions = [
      "ec2:*", "rds:*", "ecs:*", "ecr:*", "elasticloadbalancing:*",
      "application-autoscaling:*", "cloudwatch:*", "logs:*", "sns:*",
      "secretsmanager:*", "ssm:*", "lambda:*", "appsync:*",
      "cloudformation:*", "cloudfront:*", "acm:*", "xray:*",
      "s3:*", "kms:DescribeKey", "kms:ListAliases",
    ]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = distinct([var.aws_region, "us-east-1"]) # us-east-1 for CloudFront / ACM
    }
  }

  statement {
    sid    = "GlobalReadOnly"
    effect = "Allow"
    actions = [
      "iam:GetRole", "iam:ListRoles", "iam:GetPolicy", "iam:GetPolicyVersion",
      "iam:ListAttachedRolePolicies", "iam:ListRolePolicies", "iam:GetRolePolicy",
      "iam:ListInstanceProfilesForRole", "iam:ListPolicyVersions", "iam:GetOpenIDConnectProvider",
      "cloudfront:Get*", "cloudfront:List*", "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }

  statement {
    sid    = "ManageOnlyProjectRoles"
    effect = "Allow"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:UpdateRole", "iam:TagRole", "iam:UntagRole",
      "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy",
      "iam:UpdateAssumeRolePolicy", "iam:CreatePolicy", "iam:DeletePolicy", "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion", "iam:TagPolicy",
    ]
    resources = [
      "arn:aws:iam::${local.account_id}:role/${var.project}-*",
      "arn:aws:iam::${local.account_id}:policy/${var.project}-*",
    ]
  }

  statement {
    sid       = "PassOnlyProjectRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.project}-*"]
  }

  statement {
    sid       = "ServiceLinkedRoles"
    effect    = "Allow"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/aws-service-role/*"]
  }

  # The deploy role must never be able to escalate its own privileges.
  statement {
    sid       = "DenySelfModification"
    effect    = "Deny"
    actions   = ["iam:*"]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.project}-github-deploy"]
  }
}

resource "aws_iam_policy" "github_deploy" {
  name   = "${var.project}-github-deploy"
  policy = data.aws_iam_policy_document.github_deploy.json
}

resource "aws_iam_role_policy_attachment" "github_deploy" {
  role       = aws_iam_role.github_deploy.name
  policy_arn = aws_iam_policy.github_deploy.arn
}
