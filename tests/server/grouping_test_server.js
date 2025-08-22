import { createTestUser } from "../utils.js";
import { initializeTestCollections } from "../utils.js";

const groupingCollections = initializeTestCollections();

// Publisher and methods are defined in tests/grouping_integration_tests.js to avoid duplication

Tinytest.addAsync("partitioner - collections - local empty find", async (test) => {
  const userId = await createTestUser();
  const originalUserId = Meteor.userId;
  Meteor.userId = () => userId;

  // Ensure the user has a group and run finds in that group context
  const testGroupId = "server_test_group";
  await Partitioner.clearUserGroup(userId);
  await Partitioner.setUserGroup(userId, testGroupId);

  await Partitioner.bindUserGroup(userId, async () => {
    test.equal(await groupingCollections.basicInsert.find().countAsync(), 0);
    test.equal(await groupingCollections.basicInsert.find({}).countAsync(), 0);
  });

  Meteor.userId = originalUserId;
});


Tinytest.addAsync("partitioner - grouping - undefined default group", async (test) => {
  const groupResult = await Partitioner.group();
  test.equal(groupResult, undefined);
});

// The overriding is done separately for hooks
Tinytest.addAsync("partitioner - grouping - override group environment variable", async (test) => {
  Partitioner.bindGroup("overridden", async () => {
    test.equal(await Partitioner.group(), "overridden");
  });
});

Tinytest.addAsync("partitioner - collections - disallow arbitrary insert", async (test) => {
  try {
      await groupingCollections.basicInsert.insertAsync({foo: "bar"});
      test.fail("Expected insert to throw an error");
    } catch (error) {
      test.equal(error.error, 403);
      test.equal(error.reason, ErrMsg.userIdErr);
    }
});

Tinytest.addAsync("partitioner - collections - insert with overridden group", async (test) => {
  await Partitioner.bindGroup("overridden", async () => {
    await groupingCollections.basicInsert.insertAsync({foo: "bar"});
    const result = await groupingCollections.basicInsert.find({foo: "bar"}).fetchAsync();
    test.equal(result.length, 1);
    test.equal(result[0]._groupId, "overridden");
  });
});