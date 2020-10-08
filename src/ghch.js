const { Octokit } = require('@octokit/rest')
const Clubhouse = require('clubhouse-lib')
const ora = require('ora')
const chalk = require('chalk')

const log = console.log

const githubClubhouseImport = options => {
  validateOptions(options)
  const octokit = new Octokit({
    auth: options.githubToken,
  })

  const [owner, repo] = options.githubUrl.split('/')

  function fetchGithubIssues() {
    const octokitOptions = octokit.issues.listForRepo.endpoint.merge({
      owner,
      repo,
      per_page: 100,
      state: options.state,
    })
    return octokit
      .paginate(octokitOptions)
      .then(data => {
        const issues = data.filter(issue => !issue.pull_request)
        return issues
      })
      .catch(err => {
        spinner.fail(
          `Failed to fetch issues from ${chalk.underline(options.githubUrl)}\n`
        )
        log(chalk.red(err))
      })
  }

  function discardAlreadyImported(issues){
    const clubhouse = Clubhouse.create(options.clubhouseToken)
    return clubhouse.listStories(options.clubhouseProject)
                    .then(stories => {                      
                      issues = issues.filter((issue)=>{
                        for (var story of stories){
                          if (('string' == typeof story.external_id) &&                              
                              (story.external_id.toString() == issue.number.toString())){
                            return false
                          }
                        }
                        return true 
                      })                      
                      return issues
                    })
                    .catch((err)=>{log(err)
                      spinner.fail(
                        `Failed to fetch stories from project ${chalk.underline(options.clubhouseProject)}\n`
                      )
                      log(chalk.red(err))
                    })
    
  }
  
  function importIssuesToClubhouse(issues) {        
    const clubhouse = Clubhouse.create(options.clubhouseToken)    
    return clubhouse
      .getProject(options.clubhouseProject)
      .then(project => {
        let issuesImported = 0
        return Promise.all(
          issues.map(({ created_at, updated_at, labels, title, body, html_url, number }) => {
            const story_type = getStoryType(labels)
            story_data = {
              created_at,
              updated_at,
              story_type,
              requested_by_id: options.requesterId,
              labels: [{ "color": "silver", "description": "issue", "external_id": "2096", "name": "issue" }],
              name: title,
              description: body.replace('{$github-issue-url}',html_url).replace('{$github-issue}',number.toString()).toString(),
              external_id: number.toString(),
              external_links: [html_url],
              external_tickets:[{external_url:html_url, external_id: number.toString()}],
              project_id: project.id,
            }
            return reflect(
              clubhouse
                .createStory(story_data)
                .then(() => (issuesImported = issuesImported + 1))
                .catch((error) => {
                  log(error)
                  log(chalk.red(`Failed to import issue #${number}`))
                })
            )
          })
        ).then(() => {
          return issuesImported
        })
      })
      .catch(() => {
        log(
          chalk.red(
            `Clubhouse Project ID ${
              options.clubhouseProject
            } could not be found`
          )
        )
      })
  }

  const githubSpinner = ora('Retrieving issues from Github').start()
  fetchGithubIssues().then(issues => {
    githubSpinner.succeed(
      `Retrieved ${chalk.bold(issues.length)} issues from Github`
    ) 
    const filterSpinner = ora('Importing issues into Clubhouse').start()       
    discardAlreadyImported(issues).then(issuesFiltered => {
      filterSpinner.succeed(
        `Discarded ${chalk.bold(issues.length-issuesFiltered.length)} already imported issues`
      )
      const clubhouseSpinner = ora('Importing issues into Clubhouse').start()
      importIssuesToClubhouse(issuesFiltered).then(issuesImported => {
        clubhouseSpinner.succeed(
          `Imported ${chalk.bold(issuesImported)} issues into Clubhouse`
        )
      })
    })
  })
}

const validateOptions = options => {
  let hasError = false
  if (!options.githubToken) {
    hasError = true
    log(chalk.red(`Usage: ${chalk.bold('--github-token')} arg is required`))
  }

  if (!options.clubhouseToken) {
    hasError = true
    log(chalk.red(`Usage: ${chalk.bold('--clubhouse-token')} arg is required`))
  }

  if (!options.clubhouseProject) {
    hasError = true
    log(
      chalk.red(`Usage: ${chalk.bold('--clubhouse-project')} arg is required`)
    )
  }

  if (!options.githubUrl) {
    hasError = true
    log(chalk.red(`Usage: ${chalk.bold('--github-url')} arg is required`))
  }

  if (!['open', 'closed', 'all'].includes(options.state.toLowerCase())) {
    hasError = true
    log(
      chalk.red(
        `Usage: ${chalk.bold('--state')} must be one of open | closed | all`
      )
    )
  }

  if (hasError) {
    log()
    process.exit(1)
  }
}

function getStoryType(labels) {
  if (labels.find(label => label.name.includes('enhancement'))) return 'feature'
  if (labels.find(label => label.name.includes('chore'))) return 'chore'
  return 'bug'
}

const reflect = p =>
  p.then(v => ({ v, status: 'fulfilled' }), e => ({ e, status: 'rejected' }))

module.exports.default = githubClubhouseImport
