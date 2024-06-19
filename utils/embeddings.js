import { OpenAI } from "openai";

const openai = new OpenAI(process.env.OPENAI_API_KEY);

// Function to sleep for a specified duration in milliseconds
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

// export async function createEmbedding(text) {
//     try {
//       const params = {
//         model: "text-embedding-ada-002",
//         input: text.replace(/\n/g, " "),
//       };
  
//       const response = await openai.embeddings.create(params);
//       const result = response
  
//       // Access the embedding from the parsed JSON
//       return result.data[0].embedding;
//     } catch (error) {
//       console.error("Error calling OpenAI embeddings API", error);
//       throw error;
//     }
//   }

  export async function createEmbedding(text) {
    const params = {
     // model: "text-embedding-ada-002",
      model: "text-embedding-3-small",
      input: text.replace(/\n/g, " "),
    };
  
    try {
      // Introduce a delay of 20 seconds before making the API call
    //  await sleep(1000);
      
      const response = await openai.embeddings.create(params);
      const result = response.data;
  
      if (result && result.length > 0 && result[0].embedding) {
        // Access the embedding from the parsed JSON
        return result[0].embedding;
      } else {
        throw new Error("Unexpected response format from OpenAI API");
      }
    } catch (error) {
      console.error("Error calling OpenAI embeddings API:", error.message);
      throw error;
    }
  }