#!/bin/bash

# exit when any command fails
set -e

if [ -z "${SNYKTOKEN}" ]; then
    echo -e "Could not find snyk token, skipping scan"
    exit 0
fi

repo_dir=$GITHUB_WORKSPACE
file_to_search=Dockerfile
tmp_dir="${repo_dir}/tmp.${RANDOM}"
severity_threshold=critical
docker_workspace=/opt/workspace/
repo_name="$(basename "$repo_dir")"
timestamp=$(date +%s)
stdout_file=${repo_name}.${timestamp}
pull_number=$(jq --raw-output .pull_request.number "$GITHUB_EVENT_PATH")
PR_URL="$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls/$pull_number/files"

mkdir -p $tmp_dir

if [ -z "${GITHUB_BASE_REF}" ] && [[ ! -f "$repo_dir/$file_to_search" ]]; then
    # if its a push and there is no  Dockerfile in this repo, let's no waste time
    echo "This repo appear to not contain any Dockerfile, skipping container security scans"
    exit 0
else
    # Retrieving list of modified files in this PR
    curl -s -H "Authorization: Bearer ${GITHUBTOKEN}" $PR_URL > $tmp_dir/files_list.json

    # If no Dockerfile file has been fond in this PR, let's skip the check
    dockerfile_check=$(cat $tmp_dir/files_list.json | jq -r '.[]|select(.filename | startswith("'$file_to_search'"))')
    if [[ ! $dockerfile_check ]]; then
        echo -e "This PR does not contain any $file_to_search, skipping scans"
        exit 0
    fi

# Check if docker is installed
if ! command -v "docker" &> /dev/null
then
    echo "Unable to find docker. Is it installed and added to your \$PATH?"
    exit 1
fi


cd $repo_dir
docker build -t $repo_name:$timestamp . > /dev/null 2>&1
set +e
docker run --rm --name=snyk_scanner \
    -t \
    -e SNYK_TOKEN=${SNYKTOKEN} \
    -v "${repo_dir}:${docker_workspace}" \
    -v /var/run/docker.sock:/var/run/docker.sock \
    --entrypoint=snyk \
    567716553783.dkr.ecr.us-east-1.amazonaws.com/snyk-security-cli:1618494892 \
    test \
    --docker ${repo_name}:${timestamp} \
    --file=${docker_workspace}/${file_to_search} \
    --severity-threshold=${severity_threshold} \
    > $stdout_file 2>&1

exit_code=$?

# tweak to go around bizzare formatting of github actions web console
sed -i 1d $stdout_file
sed -i '/- Analyzing/d' $stdout_file
sed -i '/Testing/d' $stdout_file
sed -i '/Pro tip/d' $stdout_file
sed -i '/To remove/d' $stdout_file
cat $stdout_file

wth_is_that_wiki='https://www.notion.so/typeform/What-is-this-new-CI-check-437257998c014520a98f155870ed474e'

if [ $exit_code -eq 0 ]; then
    echo -e "Vulnerabilities scan finished. No ${severity_threshold} vulnerabilities were found"
elif [ $exit_code -eq 1 ]; then
    echo -e "Scan finished. Some ${severity_threshold} vulnerabilities were found, please fix it?"
    echo -e "Wondering how to understand this output, check out this page ${wth_is_that_wiki}"
elif [ $exit_code -eq 2 ]; then
    echo -e "We got a situation here, snyk program failed to complete his task"
elif [ $exit_code -eq 3 ]; then
    echo -e "Well, that should not happen!!"
else
    echo "Error scanning"
fi

# Clean up
docker logout

exit $exit_code
