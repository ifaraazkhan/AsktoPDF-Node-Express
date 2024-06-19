import { Pinecone } from "@pinecone-database/pinecone";
import {convertToAscii} from '../utils/helper.js';
import {createEmbedding } from '../utils/embeddings.js';

export async function getMatchesFromEmbeddings(embeddings,fileKey) {
  try {
    const client = new Pinecone();
    const pineconeIndex = client.index("ask2pdf");
    const namespace = pineconeIndex.namespace(convertToAscii(fileKey));
    const queryResult = await namespace.query({
      topK: 5,
      vector: embeddings,
      includeMetadata: true,
    });
    return queryResult.matches || [];
  } catch (error) {
    console.log("error querying embeddings", error);
    throw error;
  }
}

export async function getContext(query, fileKey) {
  const queryEmbeddings = await createEmbedding(query);
 // console.log("queryEmbeddings",queryEmbeddings);
  const matches = await getMatchesFromEmbeddings(queryEmbeddings, fileKey);
  console.log("matches", matches);

  const qualifyingDocs = matches.filter(
    (match) => match.score && match.score >= 0
  );
  console.log("qualifyingDocs",qualifyingDocs);

  //let docs = qualifyingDocs.map((match) => (match.metadata).text);
  let docs = qualifyingDocs.map((match) => ({
    text: `${match.metadata.text}`,
    pageNumber: match.metadata.pageNumber,
  }));
  // 5 vectors
  //return docs.join("\n").substring(0, 3000); 

  //return without page number
  //return docs.map((doc) => doc.text).join("\n");

  //with page number
   docs.map((doc) => doc.text).join("\n");
   return docs;
}