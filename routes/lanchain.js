import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import natural from 'natural';
import stopwords from "stopword";

const loader = new PDFLoader("temp/test.pdf", {
  parsedItemSeparator: "",
});

const docs = await loader.load();
console.log("Extracted Text ---> ",docs[0]);
console.log("Extracted Text chararcters ---> ",docs[0].pageContent.length);

preProcessData(docs);


//Text pre-processing before Embedding
//Step 1 - lowercasing and remove extra spaces and newlines also remove html tags

const lowercasedDocs = docs.map(doc => {
    const lowercasedContent = doc.pageContent.toLowerCase().replace(/\s+/g, ' ').replace(/<[^>]*>/g, '').replace(/(?:https?|ftp):\/\/[\n\S]+/g, '').trim();

     // Calculate character and word counts
     const charCount = lowercasedContent.length;
     const wordCount = lowercasedContent.split(/\s+/).filter(word => word.length > 0).length;
 
    return {
        ...doc,  // Copying all properties from the original document
        pageContent: lowercasedContent,  // Updating only the pageContent property
        charCount,
        wordCount
    };
});

// Printing the modified documents
// lowercasedDocs.forEach((lowercasedDoc, index) => {
//     console.log(`Step-1 Modified Lowercase ${index + 1}:\n`, lowercasedDoc, '\n');
// });




// Step 2 - Tokenize the text
const tokenizer = new natural.WordTokenizer();
const tokenizationText = lowercasedDocs.map(doc => {
    const tokenContent = tokenizer.tokenize(doc.pageContent);

    return {
        ...doc,  // Copying all properties from the original document
        pageContent: tokenContent.join(' '),  // Joining the tokens into a string
    };
});

// Printing the tokenized documents
// tokenizationText.forEach((tokenizedDoc, index) => {
//     console.log(`Step 2 - Tokenized Document ${index + 1}:\n`, tokenizedDoc, '\n');
// });

// Step 3 - Remove stop words like 'and', 'or', 'in', etc.
const stopWordsRemovedDocs = tokenizationText.map(doc => {
    const stopWordsRemovedContent = stopwords.removeStopwords(doc.pageContent.split(' ')).join(' ');

     // Calculate character and word counts
     const charCount = stopWordsRemovedContent.length;
     const wordCount = stopWordsRemovedContent.split(/\s+/).filter(word => word.length > 0).length;

    return {
        ...doc,  // Copying all properties from the original document
        pageContent: stopWordsRemovedContent,  // Updating only the pageContent property
        charCount,
        wordCount
    };
});

// Printing the modified documents
// stopWordsRemovedDocs.forEach((removedWordsDoc, index) => {
//     console.log(`Step 3 - Stopword Removed Document ${index + 1}:\n`, removedWordsDoc, '\n');
// });

// Step 4 - Stemming
const stemmer = natural.LancasterStemmer;
const stemmedDocs = stopWordsRemovedDocs.map(doc => {
    const stemmedContent = doc.pageContent.split(' ').map(word => stemmer.stem(word)).join(' ');
    return {
        ...doc,
        pageContent: stemmedContent
    };
});

// Printing the modified documents
// stemmedDocs.forEach((stemmedDoc, index) => {
//     console.log(`Modified Document ${index + 1}:\n`, stemmedDoc, '\n');
// });



export async function preProcessData(docs) {
    const tokenizer = new natural.WordTokenizer();
    const processedData = docs.map(doc => {
        const lowercasedContent = doc.pageContent.toLowerCase().replace(/<[^>]*>/g, '').replace(/<[^>]*>/g, '').replace(/\n{2,}/g, '\n').replace(/(?:https?|ftp):\/\/\S+/g, '').replace(/[ \t]+/g, ' ').trim();
       // replace(/\s+/g, ' ').replace(/<[^>]*>/g, '').replace(/\n{2,}/g, '\n').replace(/(?:https?|ftp):\/\/\S+/g, '').
        console.log("lowerCASE--->",lowercasedContent);
        const stopWordsRemovedContent = stopwords.removeStopwords(lowercasedContent.split(' ')).join(' ');
        console.log("stopWordsRemovedContent--->",stopWordsRemovedContent);
        // const tokenContent = tokenizer.tokenize(stopWordsRemovedContent);
        // console.log("tokenContent--->",tokenContent);
       
     
        return {
            ...doc,  // Copying all properties from the original document
            pageContent: stopWordsRemovedContent,  // Updating only the pageContent property
        };
    });

    // Printing the modified documents
    processedData.forEach((data, index) => {
    console.log(`preProcessData ${index + 1}:\n`, data, '\n');
});

}







//- Step-1 Lowercasing: Removing HTML Tags and URLs: Whitespace Removal: 
//- Step-2 Tokenization: Removing Punctuation and Special Characters
//- Step-3 Stopword Removal:
// 
// Stemming or Lemmatization:
// Handling Numbers:
// 
// Handling Abbreviations and Acronyms:
// 
// Spell Checking:
// Handling Emoticons and Special Characters:
// Text Normalization:
// Joining Tokens: