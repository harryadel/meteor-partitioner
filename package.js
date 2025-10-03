Package.describe({
  name: "mizzao:partitioner",
  summary: "Transparently divide a meteor app into different instances shared between groups of users.",
  version: "0.7.0-beta.12",
  git: "https://github.com/mizzao/meteor-partitioner.git"
});

Package.onUse(function (api) {
  api.versionsFrom(['3.0']);

  // Client & Server deps
  api.use([
    'ecmascript',
    'accounts-base',
    'check',
    'ddp', // Meteor.publish available
    'mongo' // Mongo.Collection available
  ]);

  api.use("matb33:collection-hooks@2.1.0-beta.4");

  api.addFiles('common.js');

  api.addFiles('grouping.js', 'server');
  api.addFiles('grouping_client.js', 'client');

  api.export(['Partitioner', 'Grouping']);

  // Package-level variables that should not be exported
  // See http://docs.meteor.com/#/full/coffeescript
  api.export(['ErrMsg', 'Helpers'], {testOnly: true});

  api.export('TestFuncs', {testOnly: true});
});

Package.onTest(function (api) {
  api.use("mizzao:partitioner");

  api.use([
    'ecmascript',
    'accounts-base',
    'accounts-password', // For createUser
    'ddp', // Meteor.publish available
    'mongo', // Mongo.Collection available
    'tracker' // Deps/Tracker available
  ]);

  api.use([
    'tinytest',
    'test-helpers'
  ]);

  api.addFiles('tests/utils.js');
  api.addFiles('tests/client/hook_tests_client.js', 'client');
  api.addFiles('tests/grouping_integration_tests.js');
  api.addFiles('tests/server/hook_tests_server.js', 'server');
  api.addFiles('tests/server/grouping_test_server.js', 'server');
  api.addFiles('tests/server/grouping_index_tests.js', 'server');
});
