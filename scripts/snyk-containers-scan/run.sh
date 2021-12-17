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
random_number=${RANDOM}
echo $repo_dir
echo $repo_name

if [ ! -f "$repo_dir/$file_to_search" ]; then
    echo "This repo appear to not contain any Dockerfile, skipping container security scans"
    exit 0
fi

#building docker images
docker build -t $(repo_name):$(random_number) .

docker images
# TO DO
exit 0
