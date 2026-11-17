locals {
  name = "${var.project}-${var.environment}" # graphql-app-prod
  tags = {
    Project     = var.project
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = "github.com/Md-Adheep/graphql-serverless-aws"
  }
}

module "vpc" {
  source             = "../../modules/vpc"
  name               = local.name
  aws_region         = var.aws_region
  single_nat_gateway = var.single_nat_gateway
}

module "secrets" {
  source                  = "../../modules/secrets"
  name                    = local.name
  recovery_window_in_days = var.allow_destroy ? 0 : 7
}

module "rds" {
  source                  = "../../modules/rds"
  name                    = local.name
  database_subnet_ids     = module.vpc.database_subnet_ids
  security_group_id       = aws_security_group.rds.id
  proxy_security_group_id = aws_security_group.rds_proxy.id
  instance_class          = var.db_instance_class
  multi_az                = var.db_multi_az
  create_read_replica     = var.db_create_read_replica
  deletion_protection     = !var.allow_destroy
  skip_final_snapshot     = var.allow_destroy
}

module "ecs" {
  source                    = "../../modules/ecs"
  name                      = local.name
  aws_region                = var.aws_region
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  alb_security_group_id     = aws_security_group.alb.id
  service_security_group_id = aws_security_group.ecs.id
  db_proxy_endpoint         = module.rds.proxy_endpoint
  db_proxy_resource_id      = module.rds.proxy_resource_id
  db_name                   = module.rds.db_name
  db_username               = module.rds.username
  internal_token_secret_arn = module.secrets.internal_token_secret_arn
  min_capacity              = var.ecs_min_capacity
  max_capacity              = var.ecs_max_capacity
  force_delete_ecr          = var.allow_destroy
}

module "frontend" {
  source        = "../../modules/frontend"
  name          = local.name
  aws_region    = var.aws_region
  domain_name   = var.domain_name
  force_destroy = var.allow_destroy
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }
}

module "monitoring" {
  source                  = "../../modules/monitoring"
  name                    = local.name
  aws_region              = var.aws_region
  alert_email             = var.alert_email
  ecs_cluster_name        = module.ecs.cluster_name
  ecs_service_name        = module.ecs.service_name
  alb_arn_suffix          = module.ecs.alb_arn_suffix
  target_group_arn_suffix = module.ecs.target_group_arn_suffix
  db_instance_identifier  = module.rds.instance_identifier
  db_proxy_name           = module.rds.proxy_name
  lambda_function_prefix  = "graphql-app-lambdas-${var.environment}"
}
