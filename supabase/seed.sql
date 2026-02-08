-- Seed data for development

-- Seed companies
INSERT INTO companies (id, name, slug, description, location, size) VALUES
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'TechCorp', 'techcorp', 'Leading AI company building the future of work', 'San Francisco, CA', '100-500'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'StartupXYZ', 'startupxyz', 'Fast-growing startup in the fintech space', 'Remote', '10-50'),
  ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'DataFlow', 'dataflow', 'Data infrastructure platform for enterprise', 'New York, NY', '500-1000')
ON CONFLICT (id) DO NOTHING;

-- Seed positions
INSERT INTO positions (
  id, company_id, title, slug, description, requirements,
  employment_type, location_type, status, screening_questions
) VALUES
  (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Senior Full Stack Engineer',
    'senior-full-stack',
    'We are looking for a Senior Full Stack Engineer to join our engineering team. You will be responsible for building scalable web applications and mentoring junior developers.',
    ARRAY['5+ years experience with React and Node.js', 'Experience with PostgreSQL and Redis', 'Strong understanding of TypeScript', 'Experience with cloud platforms (AWS/GCP)'],
    'full_time',
    'hybrid',
    'active',
    '[
      {"question": "Describe your experience with React and Node.js", "type": "text", "required": true},
      {"question": "What is your preferred approach to database schema design?", "type": "text", "required": true}
    ]'::jsonb
  ),
  (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
    'Machine Learning Engineer',
    'ml-engineer',
    'Join our ML team to build cutting-edge AI models for financial forecasting. You will work with large datasets and deploy models to production.',
    ARRAY['3+ years experience with Python', 'Experience with PyTorch or TensorFlow', 'Strong understanding of ML algorithms', 'Experience with MLOps'],
    'full_time',
    'remote',
    'active',
    '[
      {"question": "Describe a machine learning project you are proud of", "type": "text", "required": true},
      {"question": "How do you approach model deployment and monitoring?", "type": "text", "required": false}
    ]'::jsonb
  ),
  (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13',
    'DevOps Engineer',
    'devops-engineer',
    'Help us build reliable infrastructure for our data platform. You will work with Kubernetes, Terraform, and CI/CD pipelines.',
    ARRAY['4+ years experience with AWS/GCP', 'Experience with Kubernetes', 'Strong understanding of Infrastructure as Code', 'Experience with monitoring and observability'],
    'full_time',
    'on_site',
    'active',
    '[
      {"question": "Describe your experience with Kubernetes and container orchestration", "type": "text", "required": true}
    ]'::jsonb
  ),
  (
    'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Product Designer',
    'product-designer',
    'Design intuitive user experiences for our AI-powered platform. You will work closely with product and engineering teams.',
    ARRAY['3+ years experience in product design', 'Strong portfolio demonstrating UX/UI skills', 'Experience with design systems', 'Experience working with engineering teams'],
    'full_time',
    'hybrid',
    'active',
    '[
      {"question": "Share a link to your portfolio", "type": "text", "required": true},
      {"question": "Describe your design process", "type": "text", "required": true}
    ]'::jsonb
  )
ON CONFLICT (id) DO NOTHING;

-- Note: Applications and other user-specific data should be created through the application
-- to ensure proper RLS policies are respected
