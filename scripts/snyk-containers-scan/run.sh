#!/bin/bash

# exit when any command fails
set -e

repo_dir=$GITHUB_WORKSPACE
tmp_dir="${repo_dir}/tmp.${RANDOM}"
file_to_search=Dockerfile
severity_threshold=critical
docker_workspace=/opt/workspace/
repo_name="$(basename "$repo_dir")"
timestamp=$(date +%s)
stdout_file=${repo_name}.${timestamp}
pull_number=$(jq --raw-output .pull_request.number "$GITHUB_EVENT_PATH")
PR_URL="$GITHUB_API_URL/repos/$GITHUB_REPOSITORY/pulls/$pull_number/files"

mkdir -p $tmp_dir

if [[ ! -f "$repo_dir/$file_to_search" ]]; then
    echo "This repo appear to not contain any Dockerfile, skipping container security scans"
    exit 0
fi

echo "Retrieving PR#$pull_number files info from ${PR_URL}"
curl -s -H "Authorization: Bearer ${GITHUBTOKEN}" $PR_URL > $tmp_dir/files_list.json

dockerfile_check=$(cat $tmp_dir/files_list.json | jq -r '.[]|select(.filename | startswith("'$file_to_search'"))')
if [[ ! $dockerfile_check ]]; then
    echo -e "This PR does not contain any changes in $file_to_search, skipping checks"
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
    567716553783.dkr.ecr.us-east-1.amazonaws.com/security-dummy-repo:1603871124 \
    test \
    --docker ${repo_name}:${timestamp} \
    --file=${docker_workspace}/${file_to_search} \
    --severity-threshold=${severity_threshold} \
    > $stdout_file 2>&1

exit_code=$?

# tweak to go around bizzare formatting of github actions web console
sed -i 1d $stdout_file
sed -i '/Testing/d' $stdout_file
sed -i '/Pro tip/d' $stdout_file
sed -i '/To remove/d' $stdout_file
cat $stdout_file

if [ $exit_code -eq 0 ]; then
    echo -e "Vulnerabilities scan finished. No ${severity_threshold} vulnerabilities were found"
elif [ $exit_code -eq 1 ]; then
    echo -e "Scan finished. Some ${severity_threshold} vulnerabilities were found, please fix it?"
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
