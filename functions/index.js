/* eslint-disable */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const cors = require("cors");
const NodeCache = require('node-cache');
const myCache = new NodeCache({ checkperiod: 120, useClones: true });
const cacheKeyPrefix = 'recommendations';
admin.initializeApp();
const addSingleDataToCollection = async (data, collectionName) => {
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
exports.addSingleData = functions.https.onRequest(async (request, response) => {
  try {
    const { data, collectionName } = request.body;

    if (!data || !collectionName) {
      ``;
      response.status(400).send("Bad Request: Missing required parameters.");
      return;
    }

    await addSingleDataToCollection(data, collectionName);
    response
      .status(200)
      .send(`data  added to ${collectionName} collection successfully!`);
  } catch (error) {
    console.error("Error adding data :", error);
    response.status(500).send("Internal Server Error");
  }
});
const addMultipleDataToCollection = async (data, collectionName) => {
  const db = admin.firestore();
  const collectionRef = db.collection(collectionName);

  try {
    // Loop through the array of questions and add each one to the collection
    for (const question of data) {
      await collectionRef.doc(question.key).set(question);
      console.log(
        `Document ${question.key} added to ${collectionName} collection successfully!`
      );
    }
  } catch (error) {
    console.error(
      `Error adding document to ${collectionName} collection:`,
      error
    );
    throw error;
  }
};

exports.addMultipleData = functions.https.onRequest(
  async (request, response) => {
    try {
      const { data, collectionName } = request.body;

      if (!data || !Array.isArray(data) || !collectionName) {
        response.status(400).send("Bad Request: Missing required parameters.");
        return;
      }

      await addMultipleDataToCollection(data, collectionName);
      response
        .status(200)
        .send(`Data added to ${collectionName} collection successfully!`);
    } catch (error) {
      console.error("Error adding data :", error);
      response.status(500).send("Internal Server Error");
    }
  }
);

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
    cors()(request, response, async () => {
      try {
        const { userDetails, response: userResponses } = request.body;

        if (!userDetails || !userResponses || !Array.isArray(userResponses)) {
          response.status(400).send("Bad Request: Invalid or missing data.");
          return;
        }
        const timestamp = Date.now();
        try {
          const convertedResponse = await transformUserResponse(userResponses);
          userDetails.gender = convertedResponse[0].answer;
          const userAge =userResponses.find((item) => item.question === "q2")
          userDetails.age =userAge.answer;

          const withoutRecommendation = convertedResponse.map((item) => {
            const updatedItem = { ...item };

            delete updatedItem.recommended;

            if (updatedItem.message === null) {
              delete updatedItem.message;
            }

            return updatedItem;
          });
          const nonNullableRecommendations = convertedResponse.filter(
            (item) => item.recommended !== null
          );
          let recomendations = [];
          nonNullableRecommendations.map((item) => {
            item.recommended.map((item) => {
              item.recommended.map((item) => {
                recomendations.push(item);
              });
            });
          });
          const budget = userResponses.find((item) => item.question === "q7");
          const withoutDuplicates = removeDuplicates(recomendations);
          const recommendationsByBudget = filterByBudget(
            withoutDuplicates,
            budget.answer
          );
          const dietRestrictions = convertedResponse.find( item=>item.question==='Are you on any restrictive diets?')
 const recommendationsByDiet = filterRecommendationsByDiet(recommendationsByBudget,dietRestrictions.answers)
          const userData = {
            userDetails,
            quiz: [
              {
                [Math.floor(Date.now() / 1000)]: [
                  { questions: withoutRecommendation },
                  { recommended: recommendationsByDiet },
                ],
              },
            ],
          };
          

          const documentId = await saveUserData(userData);

          const allMessages = convertedResponse
            .map((item) => item.message)
            .filter((message) => message);

          response.status(200).json({
            message: `User data saved with document ID: ${documentId}`,
            recommendations: recommendationsByDiet,
            message: allMessages,
          });
        } catch (error) {
          response.status(400).json({ error: error.message });
        }
      } catch (error) {
        console.error("Error handling request:", error);
        response.status(500).send("Internal Server Error");
      }
    });
  }
);
function filterRecommendationsByDiet (recommendations, choices) {
  return recommendations.filter((recommendation) => {
    
    return choices.every((choice) => {
      if (choice ==='No'){
        return true
      }
      else if (choice === 'Vegetarian') {
        return  recommendation.properties.hasOwnProperty('non_vegetarian') && !recommendation.properties['non_vegetarian'];
      }
      else if (choice === 'Vegan') {
        return  recommendation.properties.hasOwnProperty('Dairy_free') && recommendation.properties['Dairy_free'];
      }
     else if (choice === 'Gluten-free') {
        return  recommendation.properties.hasOwnProperty('Gluten_free') && recommendation.properties['Gluten_free'];
      }
      
    });
  });
}

function removeDuplicates(suply) {
  const keyCountMap = new Map();
  const filtered = suply.filter(({ key }) => {
    keyCountMap.set(key, (keyCountMap.get(key) || 0) + 1);
    return keyCountMap.get(key) === 1;
  });

  const duplicates = Object.fromEntries(
    Array.from(keyCountMap.entries()).filter(([key, count]) => count > 1)
  );

  filtered.forEach((obj) => {
    const key = obj.key;
    if (duplicates[key] && obj.priority > 0) {
      obj.priority = keyCountMap.get(key);
    }
  });

  console.log("Duplicates count:", duplicates);
  return filtered;
}

function filterByBudget(suply, budget) {
  const filteredSuply = [];
  let remainingBudget = budget;

  suply.sort((a, b) => {
    if (a.priority > b.priority) return -1;
    if (a.priority < b.priority) return 1;

    return a.price - b.price;
  });

  for (const item of suply) {
    if (item.price <= remainingBudget) {
      filteredSuply.push(item);
      remainingBudget -= item.price;
    } else {
      continue; // Skip to the next iteration if the item is not in budget
    }
  }

  return filteredSuply;
}

function checkCondition(condition, userDetails) {
  for (const key in condition) {
    if (userDetails[key] !== condition[key]) {
      return false;
    }
  }
  return true;
}
function filterRecommendations(recommendations, userInfo) {
  //based on condition
  return recommendations.filter((recommendation) => {
    if (recommendation.condition) {
      for (const key in recommendation.condition) {
        if (userInfo[key] !== recommendation.condition[key]) {
          return false;
        }
      }
    }
    return true;
  });
}
const transformUserResponse = async (userResponse) => {
  const userInfo = {
    gender: "",
  };
  const db = admin.firestore();
  const questionsCollectionRef = db.collection("questions");
  let messages = [];
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
            const filteredRecommendations = filterRecommendations(
              getRecomend,
              userInfo
            );

            recommendations.push({
              option: option.value,
              recommended: filteredRecommendations,
            });
          }
        }
      } else if (questionObj.type === "single_select") {
        const option = questionObj.options.find((opt) => opt.key === answer);
        if (questionObj.key === "q1") {
          userInfo.gender = option.value;
        }
        if (answer && typeof answer !== "string") {
          throw new Error(
            `${questionObj.key}: Answer must be a string for single_select questions.`
          );
        }
        // if(option && option?.message){
        //   console.log('first',option.message)
        // }
        if (option && option.recommendation) {
          const getRecomend = await Promise.all(
            option.recommendation.map((recId) =>
              getRecommendation(recId, questionObj, option)
            )
          );
          const filteredRecommendations = filterRecommendations(
            getRecomend,
            userInfo
          );

          recommendations.push({
            option: option.value,
            recommended: filteredRecommendations,
          });
        }
        return {
          question: questionObj.question,
          answer: option.value,
          recommended: recommendations.length > 0 ? recommendations : null,
          message: option.message ? option.message : null,
        };
      } else if (questionObj.type === "input") {
        return {
          question: questionObj.question,
          answer: answer,
          recommended: null,
        };
      }

      const answers =
        Array.isArray(answer) &&
        answer.map((eachAnswr) => {
          const option = questionObj.options.find(
            (opt) => opt.key === eachAnswr
          );
          return option.value;
        });
      return {
        question:
          questionObj.type === "multi_select" ? questionObj.question : question,
        answers,
        recommended: recommendations.length > 0 ? recommendations : null,
      };
    })
  );
};

const getRecommendation = async (recommendationId, questionObj, option) => {
  const cacheKey = `${cacheKeyPrefix}:${recommendationId}`;

  // Check if the recommendation is already in the cache
  const cachedData = myCache.get(cacheKey);
  if (cachedData) {
    console.log(`Recommendation ${recommendationId} found in cache.`);
    return { ...cachedData };
  }

  const db = admin.firestore();
  const recommendationRef = db.collection("recommendations").doc(recommendationId);

  try {
    const doc = await recommendationRef.get();
    if (!doc.exists) {
      console.log(`Recommendation document ${recommendationId} not found.`);
      return null;
    }

    const recommendationData = doc.data();
    console.log(`Recommendation document ${recommendationId} retrieved successfully.`);

    // Cache the recommendation for future use
    myCache.set(cacheKey, {
      question: questionObj.question,
      questionKey: questionObj.key,
      option: option.value,
      optionKey: option.key,
      ...recommendationData,
    });

    return { ...myCache.get(cacheKey) };
  } catch (error) {
    console.error(`Error getting recommendation document ${recommendationId}:`, error);
    throw error;
  }
};

const getAllQuestions = async (collectionName) => {
  const db = admin.firestore();
  const questionsCollectionRef = db.collection(collectionName || "questions");

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
    response.set("Access-Control-Allow-Origin", "*");
    const { collectionName } = request.body;
    try {
      const questions = await getAllQuestions(collectionName);
      response.status(200).json({ questions });
    } catch (error) {
      console.error("Error getting questions:", error);
      response.status(500).send("Internal Server Error");
    }
  }
);
