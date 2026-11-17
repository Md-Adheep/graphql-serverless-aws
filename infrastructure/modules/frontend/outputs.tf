output "bucket_name" {
  value = aws_s3_bucket.site.bucket
}

output "artifacts_bucket_name" {
  value = aws_s3_bucket.artifacts.bucket
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "distribution_domain" {
  value = aws_cloudfront_distribution.this.domain_name
}

output "url" {
  value = "https://${var.domain_name != "" ? var.domain_name : aws_cloudfront_distribution.this.domain_name}"
}

output "acm_validation_records" {
  description = "Create these CNAME records at your DNS provider to validate the certificate"
  value = var.domain_name == "" ? [] : [
    for o in aws_acm_certificate.this[0].domain_validation_options : {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  ]
}
