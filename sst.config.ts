import { type SSTConfig } from 'sst'
import { ApiStack } from './stacks/ApiStack'
import { PermissionStack } from './stacks/PermissionStack'
import { DatabaseStack } from './stacks/DatabaseStack'
import { Tags } from 'aws-cdk-lib/core'
// import { GithubDeploy } from './stacks/GithubDeploy'

export default {
  config (_input) {
    return {
      name: 'newsletter-backend',
      region: 'eu-central-1',
      stage: _input.stage
    }
  },
  stacks (app) {
    app.setDefaultFunctionProps({
      runtime: 'nodejs20.x',
      architecture: 'arm_64',
      logRetention: 'two_weeks',
      memorySize: app.stage === 'prod' ? 1024 : 128,
      systemLogLevel: app.stage === 'prod' ? 'info' : 'debug',
      environment: {
        ENV: app.stage,
        NODE_OPTIONS: '--enable-source-maps'
      },
      nodejs: {
        sourcemap: true,
        esbuild: {
          minify: app.stage === 'prod',
          keepNames: true,
          target: 'node20',
          platform: 'node'
        },
        minify: app.stage === 'prod'
      }
    })

    Tags.of(app).add('env', app.stage)
    Tags.of(app).add('deploy', 'sst')
    Tags.of(app).add('project', app.name)
    Tags.of(app).add('region', app.region)

    app.stack(DatabaseStack).stack(PermissionStack).stack(ApiStack)

    // uncomment if you want to use github actions
    // first run is local, then take the role arn and use it in your workflow
    // app.stack(GithubDeploy)
  }
} satisfies SSTConfig
