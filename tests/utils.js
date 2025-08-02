export async function createTestUser(usernamePrefix = "test_user") {
  const username = `${usernamePrefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const testUserId = await Accounts.createUser({username: username, password: "password"});
  return testUserId;
}

export async function createTestUserWithGroup(usernamePrefix = "test_user", groupId) {
  const testUserId = await createTestUser(usernamePrefix);
  
  await Partitioner.clearUserGroup(testUserId);
  await Partitioner.setUserGroup(testUserId, groupId);
  
  return testUserId;
}