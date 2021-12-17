#!/bin/bash

# exit when any command fails
set -e

# Check if docker is installed
if ! command -v "docker" &> /dev/null
then
    echo "Unable to find docker. Is it installed and added to your \$PATH?"
    exit 1
fi

file_to_search=Dockerfile
severity_threshold=critical
repo_dir=$GITHUB_WORKSPACE
docker_workspace=/opt/workspace/
repo_name="$(basename "$repo_dir")"
timestamp=$(date +%s)
# echo $repo_dir
# echo $repo_name

if [ ! -f "$repo_dir/$file_to_search" ]; then
    echo "This repo appear to not contain any Dockerfile, skipping container security scans"
    exit 0
fi

#building docker image
cd $repo_dir
docker build -t $repo_name:$timestamp .
docker run --rm --name=snyk_scanner \
    -t \
    -e SNYK_TOKEN=${SNYKTOKEN} \
    -v "${repo_dir}:${docker_workspace}" \
    --entrypoint=snyk \
    snyk:latest \
    test \
    --docker ${repo_name}:${timestamp} \
    --file=${docker_workspace}/${file_to_search} \
    --severity-threshold=${severity_threshold}

exit 0
