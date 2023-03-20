import { useRef, useState, useEffect, useMemo } from "react";
import { Checkbox, Panel, DefaultButton, TextField, SpinButton, Spinner, List } from "@fluentui/react";
import { SparkleFilled, BarcodeScanner24Filled } from "@fluentui/react-icons";

import { Dropdown, DropdownMenuItemType, IDropdownStyles, IDropdownOption } from '@fluentui/react/lib/Dropdown';

import styles from "./Chat.module.css";
import { Label } from '@fluentui/react/lib/Label';
import { ExampleList, ExampleModel } from "../../components/Example";

import { chatJsApi, Approaches, AskResponse, ChatRequest, ChatTurn } from "../../api";
import { Answer, AnswerError, AnswerLoading } from "../../components/Answer";
import { QuestionInput } from "../../components/QuestionInput";
import { UserChatMessage } from "../../components/UserChatMessage";
import { AnalysisPanel, AnalysisPanelTabs } from "../../components/AnalysisPanel";
import { ClearChatButton } from "../../components/ClearChatButton";
import { EventStreamContentType, fetchEventSource } from '@microsoft/fetch-event-source'

import { BlobServiceClient } from "@azure/storage-blob";
// import { OpenAI } from "langchain";


// const containerName =`${import.meta.env.VITE_CONTAINER_NAME}`
// const sasToken = `${import.meta.env.VITE_SAS_TOKEN}`
// const storageAccountName = `${import.meta.env.VITE_STORAGE_NAME}`
// const uploadUrl = `https://${storageAccountName}.blob.core.windows.net/?${sasToken}`;
// const exampleQuestionUrl = `${import.meta.env.VITE_SUMMARYQA_URL}`

const containerName =`${process.env.VITE_CONTAINER_NAME}`
const sasToken = `${process.env.VITE_SAS_TOKEN}`
const storageAccountName = `${process.env.VITE_STORAGE_NAME}`
const uploadUrl = `https://${storageAccountName}.blob.core.windows.net/?${sasToken}`;
const exampleQuestionUrl = `${process.env.VITE_SUMMARYQA_URL}`

const Chat = () => {
    const [isConfigPanelOpen, setIsConfigPanelOpen] = useState(false);
    const [promptTemplate, setPromptTemplate] = useState<string>("");
    const [retrieveCount, setRetrieveCount] = useState<number>(3);
    const [useSemanticRanker, setUseSemanticRanker] = useState<boolean>(true);
    const [useSemanticCaptions, setUseSemanticCaptions] = useState<boolean>(false);
    const [excludeCategory, setExcludeCategory] = useState<string>("");
    const [useSuggestFollowupQuestions, setUseSuggestFollowupQuestions] = useState<boolean>(false);
    const [options, setOptions] = useState<any>([])

    const [selectedItem, setSelectedItem] = useState<IDropdownOption>();
    const dropdownStyles: Partial<IDropdownStyles> = { dropdown: { width: 300 } };

    const lastQuestionRef = useRef<string>("");
    const chatMessageStreamEnd = useRef<HTMLDivElement | null>(null);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<unknown>();

    const [activeCitation, setActiveCitation] = useState<string>();
    const [activeAnalysisPanelTab, setActiveAnalysisPanelTab] = useState<AnalysisPanelTabs | undefined>(undefined);

    const [selectedAnswer, setSelectedAnswer] = useState<number>(0);
    const [answers, setAnswers] = useState<[user: string, response: AskResponse][]>([]);
    const [exampleLoading, setExampleLoading] = useState(false)

    const [selectedIndex, setSelectedIndex] = useState<string>();
    const [indexMapping, setIndexMapping] = useState<{ key: string; iType: string; summary:string; qa:string;  }[]>();
    const [exampleList, setExampleList] = useState<ExampleModel[]>([{text:'', value: ''}]);
    const [summary, setSummary] = useState<string>();
    const [qa, setQa] = useState<string>('');

    const [messageState, setMessageState] = useState({
        messages: [
          {
            message: 'Hi there! What do you want to know about ' + selectedIndex + '?',
            type: 'AI'
          }
        ],
        pending: '',
        history: []
    })

    const { messages, pending, history } = messageState

    useEffect(() => {
        setMessageState(state => ({
          messages: [
            {
              message: 'Hi there! What do you want to know about ' + selectedIndex + '?',
              type: 'AI'
            }
          ],
          pending: '',
          history: []
        }))
    }, [selectedIndex])

    const chatMessages = useMemo(() => {
        return [...messages, ...(pending ? [{ type: 'AI', message: pending }] : [])]
      }, [messages, pending])

    const makeApiRequest = async (question: string) => {
        lastQuestionRef.current = question;

        setMessageState((state) => ({
            ...state,
            messages: [
              ...state.messages,
              {
                type: "Human",
                message: question,
              },
            ],
            pending: '',
            history: []
        }));          

        error && setError(undefined);
        setIsLoading(true);
        setActiveCitation(undefined);
        setActiveAnalysisPanelTab(undefined);
        setMessageState(state => ({ ...state, pending: '' }))

        const result = await chatJsApi(question, history, String(selectedItem?.key), String(selectedIndex));
        console.log(result)
        // const data = JSON.parse(result)
        // setMessageState(state => ({
        //   ...state,
        //   pending: (state.pending ?? '') + data.data
        // }))

        // setMessageState(state => ({
        //     history: [...state.history, [question, state.pending ?? '']],
        //     messages: [
        //       ...state.messages,
        //       {
        //         type: 'AI',
        //         message: state.pending ?? ''
        //       }
        //     ],
        //     pending: ''
        // }))
        setIsLoading(false);
    };

    const clearChat = () => {
        lastQuestionRef.current = "";
        error && setError(undefined);
        setActiveCitation(undefined);
        setActiveAnalysisPanelTab(undefined);
        setAnswers([]);
    };

    const onExampleClicked = (example: string) => {
        makeApiRequest(example);
    };
    const refreshBlob = async () => {
        const blobServiceClient = new BlobServiceClient(uploadUrl)
        const containerClient = blobServiceClient.getContainerClient(containerName)
    
        const listOptions = {
          includeDeleted: false, // include deleted blobs
          includeDeletedWithVersions: false, // include deleted blobs with versions
          includeLegalHost: false, // include legal host id
          includeMetadata: true, // include custom metadata
          includeSnapshots: false, // include snapshots
          includeTags: true, // include indexable tags
          includeUncommittedBlobs: false, // include uncommitted blobs
          includeVersions: false, // include all blob version
          prefix: '' // filter by blob name prefix
        }
    
        const files = []
        const indexType = []

        const blobs = containerClient.listBlobsFlat(listOptions)
        for await (const blob of blobs) {
          if (blob.metadata?.embedded == "true")
          {
            files.push({
                text: blob.metadata?.indexName,
                key: blob.metadata?.namespace
            })
            indexType.push({
                    key:blob.metadata?.namespace,
                    iType:blob.metadata?.indexType,
                    summary:blob.metadata?.summary,
                    qa:blob.metadata?.qa
            })
          }
        }
        var uniqFiles = files.filter((v,i,a)=>a.findIndex(v2=>(v2.key===v.key))===i)

        setOptions(uniqFiles)
        setSelectedItem(uniqFiles[0])

        const defaultKey = uniqFiles[0].key
       
        var uniqIndexType = indexType.filter((v,i,a)=>a.findIndex(v2=>(v2.key===v.key))===i)

        for (const item of uniqIndexType) {
            if (item.key == defaultKey) {
                setSelectedIndex(item.iType)
                setSummary(item.summary)
                setQa(item.qa)

                const sampleQuestion = []
                const  questionList = item.qa.split("\\n")
                for (const item of questionList) {
                    if ((item != '')) {
                        sampleQuestion.push({
                            text: item.replace(/[0-9]./g, ''),
                            value: item.replace(/[0-9]./g, '')
                        })
                    } 
                }
                const generatedExamples: ExampleModel[] = sampleQuestion
                setExampleList(generatedExamples)
                setExampleLoading(false)
            }
        }
        setIndexMapping(uniqIndexType)
    }

    const onChange = (event?: React.FormEvent<HTMLDivElement>, item?: IDropdownOption): void => {
        setSelectedItem(item);
        clearChat();

        const defaultKey = item?.key

        indexMapping?.findIndex((item) => {
            if (item.key == defaultKey) {
                setSelectedIndex(item.iType)
                setSummary(item.summary)
                setQa(item.qa)

                const sampleQuestion = []

                const  questionList = item.qa.split("\\n")
                for (const item of questionList) {
                    if ((item != '')) {
                        sampleQuestion.push({
                            text: item.replace(/[0-9]./g, ''),
                            value: item.replace(/[0-9]./g, '')
                        })
                    } 
                }
                const generatedExamples: ExampleModel[] = sampleQuestion
                setExampleList(generatedExamples)
                setExampleLoading(false)
            }
        })

        // setExampleLoading(true)
        // setExampleList([])
        // const url =  exampleQuestionUrl + '&question=""&indexType=' + indexType + "&indexNs=" + defaultKey 

        // const requestOptions = {
        //     method: 'POST',
        //     headers: { 'Content-Type': 'application/json' },
        //     body: JSON.stringify({
        //         values: [
        //           {
        //             recordId: 0,
        //             data: {
        //               text: ''
        //             }
        //           }
        //         ]
        //       })
        // };
        // fetch(url, requestOptions)
        // .then(async (response) => {
        //   if (response.ok) {
        //     const jsonResp =  await response.json();
        //     const sampleQuestions = jsonResp.values[0].data.answer

        //     const sampleQuestion = []
        //     const  questionList = sampleQuestions?.split("\n")
        //     for (const item of questionList) {
        //         if (item != '') {
        //             sampleQuestion.push({
        //                 text: item,
        //                 value: item
        //             })
        //         } 
        //     }
        //     const generatedExamples: ExampleModel[] = sampleQuestion
        //     setExampleList(generatedExamples)
        //     setExampleLoading(false)
        //     //setUploadText("Completed Successfully.  You can now search for your document.")
        //   }
        // })
        // .catch((error : string) => {
        //     console.log(error)
        //     setExampleLoading(false)
        // })
    };

    useEffect(() => {
        setOptions([])
        refreshBlob()
    }, [])

    useEffect(() => chatMessageStreamEnd.current?.scrollIntoView({ behavior: "smooth" }), [isLoading]);

    const onPromptTemplateChange = (_ev?: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
        setPromptTemplate(newValue || "");
    };

    const onRetrieveCountChange = (_ev?: React.SyntheticEvent<HTMLElement, Event>, newValue?: string) => {
        setRetrieveCount(parseInt(newValue || "3"));
    };

    const onUseSemanticRankerChange = (_ev?: React.FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
        setUseSemanticRanker(!!checked);
    };

    const onUseSemanticCaptionsChange = (_ev?: React.FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
        setUseSemanticCaptions(!!checked);
    };

    const onExcludeCategoryChanged = (_ev?: React.FormEvent, newValue?: string) => {
        setExcludeCategory(newValue || "");
    };

    const onUseSuggestFollowupQuestionsChange = (_ev?: React.FormEvent<HTMLElement | HTMLInputElement>, checked?: boolean) => {
        setUseSuggestFollowupQuestions(!!checked);
    };

    const onShowCitation = (citation: string, index: number) => {
        // if (activeCitation === citation && activeAnalysisPanelTab === AnalysisPanelTabs.CitationTab && selectedAnswer === index) {
        //     setActiveAnalysisPanelTab(undefined);
        // } else {
        //     setActiveCitation(citation);
        //     setActiveAnalysisPanelTab(AnalysisPanelTabs.CitationTab);
        // }

        // setSelectedAnswer(index);
    };

    const onToggleTab = (tab: AnalysisPanelTabs, index: number) => {
        if (activeAnalysisPanelTab === tab && selectedAnswer === index) {
            setActiveAnalysisPanelTab(undefined);
        } else {
            setActiveAnalysisPanelTab(tab);
        }

        setSelectedAnswer(index);
    };

    return (
        <div className={styles.root}>
            <div>
                <div className={styles.commandsContainer}>
                    <DefaultButton onClick={refreshBlob}>Refresh PDF & Index</DefaultButton>
                    <Dropdown
                        selectedKey={selectedItem ? selectedItem.key : undefined}
                        // eslint-disable-next-line react/jsx-no-bind
                        onChange={onChange}
                        placeholder="Select an PDF"
                        options={options}
                        styles={dropdownStyles}
                    />
                    &nbsp;
                    <Label className={styles.commandsContainer}>Index Type : {selectedIndex}</Label>
                </div>
            </div>
            <div className={styles.container}>
                <div className={styles.commandsContainer}>
                    <ClearChatButton className={styles.commandButton} onClick={clearChat} disabled={!lastQuestionRef.current || isLoading} />
                </div>
                <div className={styles.chatRoot}>
                    <div className={styles.chatContainer}>
                        {!lastQuestionRef.current ? (
                            <div className={styles.chatEmptyState}>
                                <SparkleFilled fontSize={"40px"} primaryFill={"rgba(115, 118, 225, 1)"} aria-hidden="true" aria-label="Chat logo" />
                                <h3 className={styles.chatEmptyStateTitle}>Chat with your data</h3>
                                <div className={styles.example}>
                                    <p className={styles.exampleText}><b>Document Summary</b> : {summary}</p>
                                </div>
                                <h4 className={styles.chatEmptyStateSubtitle}>Ask anything or try from following example</h4>
                                {exampleLoading ? <div><span>Please wait, Generating Sample Question</span><Spinner/></div> : null}
                                <ExampleList onExampleClicked={onExampleClicked}
                                EXAMPLES={
                                    exampleList
                                } />
                            </div>
                        ) : (
                            <div className={styles.chatMessageStream}>
                                {chatMessages.map((message, index) => (
                                    <div key={index}>
                                        <UserChatMessage message={message.message} />
                                        <div className={styles.chatMessageGpt}>
                                            <div className={styles.markdownanswer}>
                                                {message.message}
                                            </div>
                                            {/* <Answer
                                                key={index}
                                                answer={message.message}
                                                isSelected={selectedAnswer === index && activeAnalysisPanelTab !== undefined}
                                                onCitationClicked={c => onShowCitation(c, index)}
                                                onThoughtProcessClicked={() => onToggleTab(AnalysisPanelTabs.ThoughtProcessTab, index)}
                                                onSupportingContentClicked={() => onToggleTab(AnalysisPanelTabs.SupportingContentTab, index)}
                                                onFollowupQuestionClicked={q => makeApiRequest(q)}
                                                showFollowupQuestions={useSuggestFollowupQuestions && answers.length - 1 === index}
                                            /> */}
                                        </div>
                                    </div>
                                ))}
                                {isLoading && (
                                    <>
                                        <UserChatMessage message={lastQuestionRef.current} />
                                        <div className={styles.chatMessageGptMinWidth}>
                                            <AnswerLoading />
                                        </div>
                                    </>
                                )}
                                {error ? (
                                    <>
                                        <UserChatMessage message={lastQuestionRef.current} />
                                        <div className={styles.chatMessageGptMinWidth}>
                                            <AnswerError error={error.toString()} onRetry={() => makeApiRequest(lastQuestionRef.current)} />
                                        </div>
                                    </>
                                ) : null}
                                <div ref={chatMessageStreamEnd} />
                            </div>
                        )}

                        <div className={styles.chatInput}>
                            <QuestionInput
                                clearOnSend
                                placeholder="Type a new question"
                                disabled={isLoading}
                                onSend={question => makeApiRequest(question)}
                            />
                        </div>
                    </div>

                    {answers.length > 0 && activeAnalysisPanelTab && (
                        <AnalysisPanel
                            className={styles.chatAnalysisPanel}
                            activeCitation={activeCitation}
                            onActiveTabChanged={x => onToggleTab(x, selectedAnswer)}
                            citationHeight="810px"
                            answer={answers[selectedAnswer][1]}
                            activeTab={activeAnalysisPanelTab}
                        />
                    )}

                    <Panel
                        headerText="Configure answer generation"
                        isOpen={isConfigPanelOpen}
                        isBlocking={false}
                        onDismiss={() => setIsConfigPanelOpen(false)}
                        closeButtonAriaLabel="Close"
                        onRenderFooterContent={() => <DefaultButton onClick={() => setIsConfigPanelOpen(false)}>Close</DefaultButton>}
                        isFooterAtBottom={true}
                    >
                        <TextField
                            className={styles.chatSettingsSeparator}
                            defaultValue={promptTemplate}
                            label="Override prompt template"
                            multiline
                            autoAdjustHeight
                            onChange={onPromptTemplateChange}
                        />

                        <SpinButton
                            className={styles.chatSettingsSeparator}
                            label="Retrieve this many documents from search:"
                            min={1}
                            max={50}
                            defaultValue={retrieveCount.toString()}
                            onChange={onRetrieveCountChange}
                        />
                        <TextField className={styles.chatSettingsSeparator} label="Exclude category" onChange={onExcludeCategoryChanged} />
                        <Checkbox
                            className={styles.chatSettingsSeparator}
                            checked={useSemanticRanker}
                            label="Use semantic ranker for retrieval"
                            onChange={onUseSemanticRankerChange}
                        />
                        <Checkbox
                            className={styles.chatSettingsSeparator}
                            checked={useSemanticCaptions}
                            label="Use query-contextual summaries instead of whole documents"
                            onChange={onUseSemanticCaptionsChange}
                            disabled={!useSemanticRanker}
                        />
                        <Checkbox
                            className={styles.chatSettingsSeparator}
                            checked={useSuggestFollowupQuestions}
                            label="Suggest follow-up questions"
                            onChange={onUseSuggestFollowupQuestionsChange}
                        />
                    </Panel>
                </div>
            </div>
        </div>
    );
};

export default Chat;