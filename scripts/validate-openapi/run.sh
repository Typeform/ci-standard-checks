#!/bin/bash

# exit when any command fails
set -e

# Check if docker is installed
if ! command -v "docker" &> /dev/null
then
    echo "Unable to find docker. Is it installed and added to your \$PATH?"
    exit 1
fi

DOCKER_REGISTRY="567716553783.dkr.ecr.us-east-1.amazonaws.com"
DOCKER_IMAGE="engineering-docs"
DOCKER_IMAGE_TAG="builder"

# Check if user is logged in to DOCKER_REGISTRY
docker login -u=${DOCKERUSERNAME} -p=${DOCKERPASSWORD} ${DOCKER_REGISTRY}
docker pull ${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${DOCKER_IMAGE_TAG}
exit_code=$?

if [ ! $exit_code -eq 0 ]; then
    echo "Unable to pull ${DOCKER_IMAGE}:${DOCKER_IMAGE_TAG} image. Are you logged in ${DOCKER_REGISTRY}?"
    exit 1
fi

if [ ! -f $(pwd)/openapi.yaml ]; then
    echo "Skipping OpenAPI validation."
    exit 0
fi

docker run --rm \
	-v $(pwd)/openapi.yaml:/app/openapi.yaml \
	${DOCKER_REGISTRY}/${DOCKER_IMAGE}:${DOCKER_IMAGE_TAG} \
	sh -c \
        "  openapi bundle --dereferenced /app/openapi.yaml > /app/openapi.der.yaml \
	        && swagger-cli validate /app/openapi.yaml \
	        && swagger-cli validate /app/openapi.der.yaml \
	        && openapi lint /app/openapi.yaml /app/openapi.der.yaml \
	    "
