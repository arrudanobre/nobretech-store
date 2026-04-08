// Função para registrar a venda no banco de dados
export const registrarVenda = async (dadosVenda) => {
    console.log("Registrando venda com dados:", dadosVenda);
const { data, error } = await supabase
        .from("vendas")
        .insert([dadosVenda]);

if (error) {
    console.error("Erro ao registrar a venda:", error);
    throw new Error(error.message);
} else {
    console.log("Venda registrada com sucesso:", data);
}

    if (error) {
        console.error("Erro ao registrar a venda:", error);
        throw new Error(error.message);  // Lançar erro para tratamento no front-end
    }
    return data;  // Retorne os dados da venda caso necessário
};

// Função para atualizar o status do aparelho no estoque
export const atualizarStatusEstoque = async (aparelhoId, status) => {
    // Implemente a lógica para atualizar o status do estoque
    // Por exemplo, usando uma API ou uma operação de banco de dados
};