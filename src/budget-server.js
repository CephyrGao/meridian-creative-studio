// Estimate locally on the final provider payload before every transport attempt, including retries.
function budgetReserve(trace,body){
  if(trace?.remaining==null)return 0;
  const wire=JSON.stringify(body);
  const bytes=new TextEncoder().encode(wire).length;
  const output=body.max_completion_tokens??body.max_tokens??body.max_output_tokens??body.options?.num_predict;
  if(!Number.isSafeInteger(output)||output<1)throw new ModelError('无法确认本次模型请求的输出上限。',409);
  const input=bytes+256+64*(body.messages?.length||body.input?.length||1);
  const reserve=input+output;
  if(trace.remaining<reserve){
    const err=new ModelError(`下一次模型请求需预留 ${reserve.toLocaleString('zh-CN')} Token，包含输入预估和最多 ${output.toLocaleString('zh-CN')} 个输出 Token。当前可用 ${trace.remaining.toLocaleString('zh-CN')}。`,409);
    err.requiredBudget=reserve;throw err;
  }
  return reserve;
}
