/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

function run_test() {
  setupTestCommon();

  debugDump("testing update cleanup when reading the status file returns " +
            "STATUS_NONE and the update xml has an update with " +
            "STATE_DOWNLOADING (Bug 539717).");

  let patchProps = {state: STATE_DOWNLOADING};
  let patches = getLocalPatchString(patchProps);
  let updates = getLocalUpdateString({}, patches);
  writeUpdatesToXMLFile(getLocalUpdatesXMLString(updates), true);
  writeStatusFile(STATE_NONE);

  patchProps = {state: STATE_FAILED};
  patches = getLocalPatchString(patchProps);
  let updateProps = {name: "Existing"};
  updates = getLocalUpdateString(updateProps, patches);
  writeUpdatesToXMLFile(getLocalUpdatesXMLString(updates), false);

  standardInit();

  Assert.ok(!gUpdateManager.activeUpdate,
            "there should not be an active update");
  let activeUpdateXML = getUpdatesXMLFile(true);
  Assert.ok(!activeUpdateXML.exists(),
            MSG_SHOULD_NOT_EXIST + getMsgPath(activeUpdateXML.path));
  Assert.equal(gUpdateManager.updateCount, 2,
               "the update manager update count" + MSG_SHOULD_EQUAL);
  let update = gUpdateManager.getUpdateAt(0);
  Assert.equal(update.state, STATE_FAILED,
               "the first update state" + MSG_SHOULD_EQUAL);
  Assert.equal(update.errorCode, ERR_UPDATE_STATE_NONE,
               "the first update errorCode" + MSG_SHOULD_EQUAL);
  Assert.equal(update.statusText, getString("statusFailed"),
               "the first update statusText " + MSG_SHOULD_EQUAL);
  update = gUpdateManager.getUpdateAt(1);
  Assert.equal(update.state, STATE_FAILED,
               "the second update state" + MSG_SHOULD_EQUAL);
  Assert.equal(update.name, "Existing",
               "the second update name" + MSG_SHOULD_EQUAL);

  let dir = getUpdatesDir();
  dir.append(DIR_PATCH);
  Assert.ok(dir.exists(), MSG_SHOULD_EXIST);

  let statusFile = dir.clone();
  statusFile.append(FILE_UPDATE_STATUS);
  Assert.ok(!statusFile.exists(), MSG_SHOULD_NOT_EXIST);

  doTestFinish();
}
