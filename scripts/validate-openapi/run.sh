#!/bin/bash

# exit when any command fails
set -e

if ! command -v "jq" &> /dev/null
then
    echo "Unable to find jq. Is it installed and added to your \$PATH?"
    exit 1
fi

if [ -z "${INPUT_GITHUBTOKEN}" ]; then
  echo "::error:: GitHub token is empty"
  exit 1
fi

pull_number=$(jq --raw-output .pull_request.number "$GITHUB_EVENT_PATH")
PR_URL="$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls/$pull_number/files"
echo "Retrieving PR#$pull_number files info from ${PR_URL}"

AUTH_HEADER="Authorization: Bearer ${INPUT_GITHUBTOKEN}"
MODIFIED_API=$(curl -f -s -H "$AUTH_HEADER" "$PR_URL" | jq '.[] | select(.filename == "openapi.yaml")' | wc -m)

if [ $MODIFIED_API -eq 0 ]; then
  echo "Skipping OpenAPI validation."
  exit 0
fi

if ! command -v "npx" &> /dev/null
then
    echo "::error:: Unable to find npx. Are you using npm with version >= 5.2.0 ?"
    exit 1
fi

# Create redocly config file in the action's directory
CONFIG_FILE="$(pwd)/.redocly.yaml"
cat > "$CONFIG_FILE" << EOF
extends:
  - recommended
rules:
  operation-4xx-response: off
  security-defined: warn
  no-identical-paths: warn
  operation-parameters-unique: warn
EOF

# Limiting the depth limits the risk of (irrelevant) `openapi.yaml` files being found in eg. `_gomodcache` or `node_modules`
IFS=$'\n' files=($(find . -maxdepth 3 -name openapi.yaml))

for f in ${files[@]}; do
    # Use --config flag to explicitly specify the config file path
    # This ensures Redocly uses our custom config regardless of where the openapi.yaml is located
    npx @redocly/cli lint --config "$CONFIG_FILE" "$f"
done

npx @redocly/cli bundle --dereferenced --ext yaml --output openapi.json $(echo ${files})