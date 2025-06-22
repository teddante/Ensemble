# Deployment Guide

This guide covers various deployment options for the Ensemble AI application.

## Quick Start

### Prerequisites

- Python 3.9+ or Docker
- OpenRouter API key (get one at [openrouter.ai](https://openrouter.ai))

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/ensemble.git
   cd ensemble
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   cp default.env .env
   # Edit .env with your API key
   nano .env
   ```

4. **Run the application**
   ```bash
   python src/ensemble.py
   ```

## Docker Deployment

### Single Container

```bash
# Build the image
docker build -t ensemble:latest .

# Run with environment file
docker run --rm -v $(pwd)/.env:/app/.env:ro ensemble:latest
```

### Docker Compose (Recommended)

```bash
# Production deployment
docker-compose up -d

# Development with hot reload
docker-compose --profile dev up

# With monitoring stack
docker-compose --profile monitoring up -d
```

### Available Profiles

- **default**: Main application only
- **dev**: Development mode with hot reload
- **monitoring**: Includes Prometheus and Grafana
- **test**: Runs test suite

## Cloud Deployment

### AWS ECS (Elastic Container Service)

1. **Build and push to ECR**
   ```bash
   # Create ECR repository
   aws ecr create-repository --repository-name ensemble

   # Get login token
   aws ecr get-login-password --region us-west-2 | \
     docker login --username AWS --password-stdin \
     <account-id>.dkr.ecr.us-west-2.amazonaws.com

   # Build and push
   docker build -t ensemble .
   docker tag ensemble:latest <account-id>.dkr.ecr.us-west-2.amazonaws.com/ensemble:latest
   docker push <account-id>.dkr.ecr.us-west-2.amazonaws.com/ensemble:latest
   ```

2. **Create ECS task definition**
   ```json
   {
     "family": "ensemble-task",
     "networkMode": "awsvpc",
     "requiresCompatibilities": ["FARGATE"],
     "cpu": "256",
     "memory": "512",
     "executionRoleArn": "arn:aws:iam::<account-id>:role/ecsTaskExecutionRole",
     "containerDefinitions": [
       {
         "name": "ensemble",
         "image": "<account-id>.dkr.ecr.us-west-2.amazonaws.com/ensemble:latest",
         "essential": true,
         "environment": [
           {
             "name": "OPENROUTER_API_KEY",
             "value": "your-api-key"
           }
         ],
         "logConfiguration": {
           "logDriver": "awslogs",
           "options": {
             "awslogs-group": "/ecs/ensemble",
             "awslogs-region": "us-west-2",
             "awslogs-stream-prefix": "ecs"
           }
         }
       }
     ]
   }
   ```

3. **Create ECS service**
   ```bash
   aws ecs create-service \
     --cluster your-cluster \
     --service-name ensemble-service \
     --task-definition ensemble-task \
     --desired-count 1 \
     --launch-type FARGATE \
     --network-configuration "awsvpcConfiguration={subnets=[subnet-12345],securityGroups=[sg-12345],assignPublicIp=ENABLED}"
   ```

### Google Cloud Run

1. **Build and push to Container Registry**
   ```bash
   # Configure Docker for GCR
   gcloud auth configure-docker

   # Build and push
   docker build -t gcr.io/your-project-id/ensemble .
   docker push gcr.io/your-project-id/ensemble
   ```

2. **Deploy to Cloud Run**
   ```bash
   gcloud run deploy ensemble \
     --image gcr.io/your-project-id/ensemble \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated \
     --set-env-vars OPENROUTER_API_KEY=your-api-key
   ```

### Azure Container Instances

```bash
# Create resource group
az group create --name ensemble-rg --location eastus

# Deploy container
az container create \
  --resource-group ensemble-rg \
  --name ensemble-app \
  --image your-registry/ensemble:latest \
  --cpu 1 \
  --memory 1 \
  --environment-variables OPENROUTER_API_KEY=your-api-key \
  --restart-policy OnFailure
```

## Kubernetes Deployment

### Basic Deployment

1. **Create namespace**
   ```yaml
   # namespace.yaml
   apiVersion: v1
   kind: Namespace
   metadata:
     name: ensemble
   ```

2. **Create secret for API key**
   ```bash
   kubectl create secret generic ensemble-secrets \
     --from-literal=openrouter-api-key=your-api-key \
     -n ensemble
   ```

3. **Deploy application**
   ```yaml
   # deployment.yaml
   apiVersion: apps/v1
   kind: Deployment
   metadata:
     name: ensemble
     namespace: ensemble
   spec:
     replicas: 3
     selector:
       matchLabels:
         app: ensemble
     template:
       metadata:
         labels:
           app: ensemble
       spec:
         containers:
         - name: ensemble
           image: your-registry/ensemble:latest
           env:
           - name: OPENROUTER_API_KEY
             valueFrom:
               secretKeyRef:
                 name: ensemble-secrets
                 key: openrouter-api-key
           resources:
             requests:
               memory: "256Mi"
               cpu: "250m"
             limits:
               memory: "512Mi"
               cpu: "500m"
           livenessProbe:
             exec:
               command:
               - python
               - -c
               - "from src.health_check import run_health_check; import asyncio; result = asyncio.run(run_health_check()); exit(0 if result['status'] != 'unhealthy' else 1)"
             initialDelaySeconds: 30
             periodSeconds: 60
   ```

### Helm Chart

1. **Create Helm chart**
   ```bash
   helm create ensemble-chart
   ```

2. **Customize values.yaml**
   ```yaml
   # values.yaml
   replicaCount: 3
   
   image:
     repository: your-registry/ensemble
     tag: latest
     pullPolicy: IfNotPresent
   
   service:
     type: ClusterIP
     port: 80
   
   resources:
     limits:
       cpu: 500m
       memory: 512Mi
     requests:
       cpu: 250m
       memory: 256Mi
   
   autoscaling:
     enabled: true
     minReplicas: 2
     maxReplicas: 10
     targetCPUUtilizationPercentage: 80
   
   env:
     OPENROUTER_API_KEY: ""
   ```

3. **Deploy with Helm**
   ```bash
   helm install ensemble ./ensemble-chart \
     --set env.OPENROUTER_API_KEY=your-api-key \
     --namespace ensemble --create-namespace
   ```

## Configuration Management

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENROUTER_API_KEY` | Yes | - | API key for OpenRouter |
| `MODELS` | No | See default.env | Comma-separated list of models |
| `REFINEMENT_MODEL_NAME` | No | First model | Model for response refinement |
| `PROMPT` | No | - | Pre-configured prompt |

### Configuration Files

- **default.env**: Default configuration (included in container)
- **.env**: User configuration (mount as volume)
- **prompt.txt**: Optional prompt file (mount as volume)

### Secrets Management

#### Kubernetes Secrets
```bash
kubectl create secret generic ensemble-secrets \
  --from-literal=openrouter-api-key=your-api-key
```

#### AWS Secrets Manager
```bash
aws secretsmanager create-secret \
  --name ensemble/openrouter-api-key \
  --secret-string "your-api-key"
```

#### Azure Key Vault
```bash
az keyvault secret set \
  --vault-name your-keyvault \
  --name openrouter-api-key \
  --value "your-api-key"
```

## Monitoring and Observability

### Health Checks

The application provides comprehensive health checks:

```bash
# Check application health
curl http://localhost:8000/health

# Detailed health check
python src/health_check.py
```

### Metrics Collection

#### Prometheus Integration

1. **Enable metrics endpoint**
   ```yaml
   # prometheus.yml
   global:
     scrape_interval: 15s
   
   scrape_configs:
   - job_name: 'ensemble'
     static_configs:
     - targets: ['ensemble:8000']
     metrics_path: '/metrics'
     scrape_interval: 5s
   ```

2. **Deploy monitoring stack**
   ```bash
   docker-compose --profile monitoring up -d
   ```

#### Custom Metrics

The application tracks:
- Request latency per model
- Success/failure rates
- Circuit breaker states
- Resource usage

### Logging

#### Structured Logging

```python
# Configure logging level
import logging
logging.basicConfig(level=logging.INFO)

# JSON logging for production
import json_logging
json_logging.init()
```

#### Log Aggregation

##### ELK Stack
```yaml
# docker-compose.yml addition
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.8.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports:
      - "9200:9200"
  
  kibana:
    image: docker.elastic.co/kibana/kibana:8.8.0
    ports:
      - "5601:5601"
    depends_on:
      - elasticsearch
```

##### Fluentd Configuration
```xml
<!-- fluent.conf -->
<source>
  @type forward
  port 24224
  bind 0.0.0.0
</source>

<match **>
  @type elasticsearch
  host elasticsearch
  port 9200
  index_name ensemble
</match>
```

## Security Considerations

### Container Security

1. **Non-root user**: Application runs as non-root user
2. **Security scanning**: Integrated Trivy scanning in CI/CD
3. **Minimal base image**: Uses Python slim image
4. **Secret management**: Secrets not included in image

### Network Security

1. **Private networks**: Use private subnets in cloud deployments
2. **Security groups**: Restrict ingress/egress traffic
3. **TLS encryption**: Use HTTPS for all external communication

### Access Control

1. **RBAC**: Implement role-based access control
2. **API authentication**: Secure API endpoints
3. **Audit logging**: Log all access attempts

## Backup and Recovery

### Data Backup

```bash
# Backup output files
tar -czf ensemble-backup-$(date +%Y%m%d).tar.gz output/

# Upload to cloud storage
aws s3 cp ensemble-backup-*.tar.gz s3://your-backup-bucket/
```

### Disaster Recovery

1. **Multi-region deployment**: Deploy in multiple cloud regions
2. **Database replication**: If using external database
3. **Automated failover**: Implement health-check based failover

## Troubleshooting

### Common Issues

1. **API key errors**
   ```bash
   # Check API key configuration
   docker exec ensemble-app env | grep OPENROUTER_API_KEY
   ```

2. **Memory issues**
   ```bash
   # Monitor memory usage
   docker stats ensemble-app
   ```

3. **Network connectivity**
   ```bash
   # Test API connectivity
   docker exec ensemble-app curl -I https://openrouter.ai
   ```

### Debug Mode

```bash
# Run with debug logging
docker run -e PYTHONPATH=/app/src -e LOG_LEVEL=DEBUG ensemble:latest
```

### Performance Tuning

1. **Resource allocation**: Adjust CPU/memory limits
2. **Concurrency**: Tune rate limiting parameters
3. **Caching**: Implement response caching if needed

## Scaling

### Horizontal Scaling

1. **Load balancing**: Use multiple instances behind load balancer
2. **Auto-scaling**: Configure based on CPU/memory metrics
3. **Queue processing**: Use message queues for batch processing

### Vertical Scaling

1. **Resource limits**: Increase CPU/memory allocation
2. **JVM tuning**: If running on JVM-based platforms
3. **Database optimization**: Optimize queries and indexing

## Support and Maintenance

### Updating

```bash
# Update to latest version
docker pull your-registry/ensemble:latest
docker-compose up -d

# Rolling update in Kubernetes
kubectl set image deployment/ensemble ensemble=your-registry/ensemble:latest
```

### Monitoring

1. **Set up alerts**: Configure alerting for failures
2. **Performance monitoring**: Track key metrics
3. **Log analysis**: Regular log review for issues

### Maintenance Windows

1. **Scheduled updates**: Plan regular update cycles
2. **Security patches**: Apply security updates promptly
3. **Backup verification**: Regular backup testing