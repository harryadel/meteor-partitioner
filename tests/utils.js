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


export const initializeTestCollections = () => {

// Reuse collections across test files to avoid duplicate collection errors
if (globalThis.__partitionerTestCollections) {
  return globalThis.__partitionerTestCollections;
}

/*
  Set up server and client hooks
*/
let hookCollection;

const basicInsertCollection = new Mongo.Collection("basicInsert");
const twoGroupCollection = new Mongo.Collection("twoGroup");


const groupingCollections = {};

groupingCollections.basicInsert = basicInsertCollection;
groupingCollections.twoGroup = twoGroupCollection;

hookCollection = (collection) => {
  collection._insecure = true;
  // Attach the hooks to the collection
  Partitioner.partitionCollection(collection);
};


/*
  Hook collections and run tests
*/
hookCollection(basicInsertCollection);
hookCollection(twoGroupCollection);

globalThis.__partitionerTestCollections = groupingCollections;
return groupingCollections;
}