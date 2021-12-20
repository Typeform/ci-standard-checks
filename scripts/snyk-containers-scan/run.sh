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
	567716553783.dkr.ecr.us-east-1.amazonaws.com/security-dummy-repo:1603871124 \
	test \
	--docker ${repo_name}:${timestamp} \
	--file=${docker_workspace}/${file_to_search} \
	--severity-threshold=${severity_threshold}

exit_code=$?

if [ $exit_code -eq 0 ]; then
    echo "Vulnerabilities scan finished. No ${severity_threshold} vulnerabilities were found"
elif [ $exit_code -eq 1 ]; then
    echo -e "Scan finished. Some ${severity_threshold} vulnerabilities were found, please fix it"
elif [ $exit_code -eq 2 ]; then
    echo -e "We got a situation here, snyk program failed to complete his task"
elif [ $exit_code -eq 3 ]; then
    echo -e "Well, that should not happen!!"
else
    echo "Error scanning"
fi

exit 0
