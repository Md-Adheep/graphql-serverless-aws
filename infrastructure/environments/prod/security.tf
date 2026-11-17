# =============================================================================
# All network access rules in one place. Each SG only admits traffic from the
# SG of the tier in front of it (SG-to-SG references, never CIDR ranges):
#
#   Lambda ──80──▶ internal ALB ──4000──▶ ECS tasks
#     │                                       │
#     └──────────5432──────▶ RDS Proxy ◀──5432┘
#                               │
#                               └──5432──▶ RDS instance
# =============================================================================

resource "aws_security_group" "lambda" {
  name        = "${local.name}-lambda"
  description = "AppSync resolver Lambdas (VPC-attached)"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-internal-alb"
  description = "Internal ALB in front of the private GraphQL server"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group" "ecs" {
  name        = "${local.name}-ecs"
  description = "Private GraphQL server tasks (ECS Fargate)"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group" "rds_proxy" {
  name        = "${local.name}-rds-proxy"
  description = "RDS Proxy"
  vpc_id      = module.vpc.vpc_id
}

resource "aws_security_group" "rds" {
  name        = "${local.name}-rds"
  description = "RDS PostgreSQL instance"
  vpc_id      = module.vpc.vpc_id
}

# ---------------- Lambda ----------------
resource "aws_vpc_security_group_egress_rule" "lambda_to_alb" {
  security_group_id            = aws_security_group.lambda.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  description                  = "Call private GraphQL server"
}

resource "aws_vpc_security_group_egress_rule" "lambda_to_proxy" {
  security_group_id            = aws_security_group.lambda.id
  referenced_security_group_id = aws_security_group.rds_proxy.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Query RDS through RDS Proxy"
}

resource "aws_vpc_security_group_egress_rule" "lambda_https" {
  security_group_id = aws_security_group.lambda.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "AWS APIs (Secrets Manager, X-Ray) via NAT"
}

# ---------------- Internal ALB ----------------
resource "aws_vpc_security_group_ingress_rule" "alb_from_lambda" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.lambda.id
  ip_protocol                  = "tcp"
  from_port                    = 80
  to_port                      = 80
  description                  = "Only the resolver Lambdas"
}

resource "aws_vpc_security_group_egress_rule" "alb_to_ecs" {
  security_group_id            = aws_security_group.alb.id
  referenced_security_group_id = aws_security_group.ecs.id
  ip_protocol                  = "tcp"
  from_port                    = 4000
  to_port                      = 4000
  description                  = "Forward to GraphQL server tasks"
}

# ---------------- ECS tasks ----------------
resource "aws_vpc_security_group_ingress_rule" "ecs_from_alb" {
  security_group_id            = aws_security_group.ecs.id
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 4000
  to_port                      = 4000
  description                  = "Only the internal ALB"
}

resource "aws_vpc_security_group_egress_rule" "ecs_to_proxy" {
  security_group_id            = aws_security_group.ecs.id
  referenced_security_group_id = aws_security_group.rds_proxy.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Database via RDS Proxy"
}

resource "aws_vpc_security_group_egress_rule" "ecs_https" {
  security_group_id = aws_security_group.ecs.id
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "ECR, Secrets Manager, CloudWatch Logs via NAT"
}

# ---------------- RDS Proxy ----------------
resource "aws_vpc_security_group_ingress_rule" "proxy_from_lambda" {
  security_group_id            = aws_security_group.rds_proxy.id
  referenced_security_group_id = aws_security_group.lambda.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Resolver Lambdas"
}

resource "aws_vpc_security_group_ingress_rule" "proxy_from_ecs" {
  security_group_id            = aws_security_group.rds_proxy.id
  referenced_security_group_id = aws_security_group.ecs.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "GraphQL server tasks"
}

resource "aws_vpc_security_group_egress_rule" "proxy_to_rds" {
  security_group_id            = aws_security_group.rds_proxy.id
  referenced_security_group_id = aws_security_group.rds.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Pooled connections to the DB instance"
}

# RDS Proxy fetches the DB secret from Secrets Manager over HTTPS.
resource "aws_vpc_security_group_egress_rule" "proxy_https" {
  security_group_id = aws_security_group.rds_proxy.id
  cidr_ipv4         = module.vpc.vpc_cidr
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  description       = "Secrets Manager (AWS-managed path)"
}

# ---------------- RDS instance ----------------
resource "aws_vpc_security_group_ingress_rule" "rds_from_proxy" {
  security_group_id            = aws_security_group.rds.id
  referenced_security_group_id = aws_security_group.rds_proxy.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  description                  = "Only RDS Proxy - apps never connect to the instance directly"
}
