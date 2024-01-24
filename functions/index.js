/* eslint-disable */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const addDataToCollection = async (data, collectionName) => {
  const db = admin.firestore();
  const collectionRef = db.collection(collectionName);

  try {
    await collectionRef.doc(data.key).set(data);
    console.log(
      `Document ${data.key} added to ${collectionName} collection successfully!`
    );
  } catch (error) {
    console.error(
      `Error adding document to ${collectionName} collection:`,
      error
    );
    throw error;
  }
};
exports.addData = functions.https.onRequest(async (request, response) => {
  try {
    const { data, collectionName } = request.body;

    if (!data || !collectionName) {
      ``;
      response.status(400).send("Bad Request: Missing required parameters.");
      return;
    }

    await addDataToCollection(data, collectionName);
    response
      .status(200)
      .send(`data  added to ${collectionName} collection successfully!`);
  } catch (error) {
    console.error("Error adding data :", error);
    response.status(500).send("Internal Server Error");
  }
});

const getDataFromCollection = async (documentId, collectionName) => {
  const db = admin.firestore();
  const docRef = db.collection(collectionName).doc(documentId);

  try {
    const doc = await docRef.get();
    if (!doc.exists) {
      console.log(
        `Document ${documentId} not found in ${collectionName} collection.`
      );
      return null;
    }

    const question = doc.data();
    console.log(
      `Document ${documentId} retrieved from ${collectionName} collection successfully.`
    );
    return question;
  } catch (error) {
    console.error(
      `Error getting document ${documentId} from ${collectionName} collection:`,
      error
    );
    throw error;
  }
};
const saveUserData = async (userData) => {
  const db = admin.firestore();

  try {
    // Generate a unique document ID
    const docRef = db.collection("userData").doc();

    // Save the user data to Firestore
    await docRef.set(userData);

    console.log(
      `User data saved successfully in the "userData" collection with document ID: ${docRef.id}`
    );
    return docRef.id;
  } catch (error) {
    console.error("Error saving user data:", error);
    throw error;
  }
};

exports.saveUserDataFunction = functions.https.onRequest(
  async (request, response) => {
    try {
      const { userDetails, response: userResponses } = request.body;

      if (!userDetails || !userResponses || !Array.isArray(userResponses)) {
        response.status(400).send("Bad Request: Invalid or missing data.");
        return;
      }
      const timestamp = Date.now();
      console.log("first", timestamp);
      const convertedResponse = await transformUserResponse(userResponses);
      userDetails.gender = convertedResponse[0].answer;
      userDetails.age = userResponses[2].answer;
      const userData = {
        userDetails,
        quiz: [{ [Math.floor(Date.now() / 1000)]: convertedResponse }],
      };
      const filteredResponse = convertedResponse.filter(
        (item) => item.recommended !== null
      );
      const documentId = await saveUserData(userData);
let recomendations =[]
filteredResponse.map((item)=>{
  item.recommended.map((item)=>{
    item.recommended.map((item)=>{
      console.log('first',item)
recomendations.push(item)
    })

  })
})
      response.status(200).json({
        message: `User data saved with document ID: ${documentId}`,
        recommendations: recomendations,
      });
    } catch (error) {
      console.error("Error handling request:", error);
      response.status(500).send("Internal Server Error");
    }
  }
);
function checkCondition(condition, userDetails) {
  for (const key in condition) {
    if (userDetails[key] !== condition[key]) {
      return false;
    }
  }
  return true;
}
const transformUserResponse = async (userResponse) => {
  const db = admin.firestore();
  const questionsCollectionRef = db.collection("questions");

  // Fetch the questions collection from Firestore
  const snapshot = await questionsCollectionRef.get();
  const questionsCollection = {};

  snapshot.forEach((doc) => {
    questionsCollection[doc.id] = doc.data();
  });

  return Promise.all(
    userResponse.map(async ({ question, answer }) => {
      const questionObj = questionsCollection[question];
      let recommendations = [];

      if (
        questionObj &&
        Array.isArray(answer) &&
        questionObj.type === "multi_select"
      ) {
        for (const eachAnswer of answer) {
          const option = questionObj.options.find(
            (opt) => opt.key === eachAnswer
          );

          if (option && option.recommendation) {
            const getRecomend = await Promise.all(
              option.recommendation.map((recId) =>
                getRecommendation(recId, questionObj, option)
              )
            );

            recommendations.push({
              option: option.value,
              recommended: getRecomend,
            });
          }
        }
      } else if (questionObj.type === "single_select") {
        const option = questionObj.options.find((opt) => opt.key === answer);

        if (option && option.recommendation) {
          const getRecomend = await Promise.all(
            option.recommendation.map((recId) =>
              getRecommendation(recId, questionObj, option)
            )
          );
          recommendations.push({
            option: option.value,
            recommended: getRecomend,
          });
        }

        return {
          question: questionObj.question,
          answer: option.value,
          recommended: recommendations.length > 0 ? recommendations : null,
        };
      } else if (questionObj.type === "input") {
        return {
          question: questionObj.question,
          answer: answer,
          recommended: null,
        };
      }
      return {
        question:
          questionObj.type === "multi_select" ? questionObj.question : question,
        answer,
        recommended: recommendations.length > 0 ? recommendations : null,
      };
    })
  );
};

// Example usage:
const getRecommendation = async (recommendationId, questionObj, option) => {
  const db = admin.firestore();
  const recommendationRef = db
    .collection("recommendations")
    .doc(recommendationId);

  try {
    const doc = await recommendationRef.get();
    if (!doc.exists) {
      console.log(`Recommendation document ${recommendationId} not found.`);
      return null;
    }

    const recommendationData = doc.data();
    console.log(
      `Recommendation document ${recommendationId} retrieved successfully.`
    );
    return {
      question: questionObj.question,
      questionKey: questionObj.key,
      option: option.value,
      optionKey: option.key,
      ...recommendationData,
    };
  } catch (error) {
    console.error(
      `Error getting recommendation document ${recommendationId}:`,
      error
    );
    throw error;
  }
};

const getAllQuestions = async () => {
  const db = admin.firestore();
  const questionsCollectionRef = db.collection("recommendations");

  try {
    const snapshot = await questionsCollectionRef.get();
    const questions = [];

    snapshot.forEach((doc) => {
      questions.push(doc.data());
    });

    return questions;
  } catch (error) {
    console.error("Error getting documents from Questions collection:", error);
    throw error;
  }
};

exports.getAllQuestions = functions.https.onRequest(
  async (request, response) => {
    try {
      const questions = await getAllQuestions();
      response.status(200).json({ questions });
    } catch (error) {
      console.error("Error getting questions:", error);
      response.status(500).send("Internal Server Error");
    }
  }
);
