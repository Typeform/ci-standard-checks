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
repo_dir=$GITHUB_WORKSPACE
repo_name="$(basename "$repo_dir")"
timestamp=$(date +%s)
echo $repo_dir
echo $repo_name

if [ ! -f "$repo_dir/$file_to_search" ]; then
    echo "This repo appear to not contain any Dockerfile, skipping container security scans"
    exit 0
fi

#building docker image
# cd $repo_dir
# docker build -t $repo_name:$timestamp .
echo $SNYKTOKEN
# docker run -t -e SNYK_TOKEN='8f644bd5-74e1-454e-a6d5-5626fe595a92' -v "/root/dummy-repo:/project" --entrypoint=snyk snyk:latest test --docker elasticsearch:6.8.13 --file=/project/Dockerfile --severity-threshold=critical



docker images
# TO DO
exit 0
