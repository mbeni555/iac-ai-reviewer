# Deliberately vulnerable sample for IaC AI Reviewer.
# Do not use this configuration in a real account.
#
# The dummy api_key below is AWS's public example access key id, not a live credential.
# It exists so the action can prove it redacts secret-shaped strings before calling an LLM.

resource "aws_s3_bucket" "logs" {
  bucket = "demo-public-logs"

  tags = {
    Owner   = "platform"
    api_key = "AKIAIOSFODNN7EXAMPLE"
  }
}

resource "aws_s3_bucket_acl" "logs" {
  bucket = aws_s3_bucket.logs.id
  acl    = "public-read"
}

resource "aws_s3_bucket_public_access_block" "logs" {
  bucket                  = aws_s3_bucket.logs.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}
