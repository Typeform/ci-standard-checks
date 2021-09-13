#!/bin/bash

# exit when any command fails
set -e

if [ ! -f $(pwd)/openapi.yaml ]; then
    echo "Skipping OpenAPI validation."
    exit 0
fi

if ! command -v "npm" &> /dev/null
then
    echo "Unable to find npm. Is it installed and added to your \$PATH?"
    exit 1
fi

npm install -g @apidevtools/swagger-cli @redocly/openapi-cli

openapi bundle --dereferenced openapi.yaml > openapi.der.yaml

swagger-cli validate openapi.yaml

swagger-cli validate openapi.der.yaml

openapi lint openapi.yaml openapi.der.yaml
