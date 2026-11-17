-- 002: sample data so the UI is not empty on first load.
-- Only inserts when the table is empty, so it is safe to re-run.

INSERT INTO tasks (title, description, status)
SELECT v.title, v.description, v.status
FROM (VALUES
  ('Provision VPC and RDS',        'Private subnets, RDS Proxy, IAM auth',          'DONE'),
  ('Deploy private GraphQL server', 'Apollo Server on ECS Fargate behind internal ALB', 'IN_PROGRESS'),
  ('Wire up CloudWatch alarms',    'Lambda, ECS, ALB and RDS alarms to SNS',        'TODO')
) AS v(title, description, status)
WHERE NOT EXISTS (SELECT 1 FROM tasks);
