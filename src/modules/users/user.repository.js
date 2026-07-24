import prisma from "../../config/client.js"

export const getUserById = async (id) =>{
    const userData =  await prisma.user.findUnique({
        where: { id },

    })
    if
(!userData) {
        return null;
    }
    const {passwordHash, ...user} = userData;
    return user;
}

export const createUser = async (userData) =>{
    const userData =  await prisma.user.create({
        data: userData
    })
    if(!userData) {
        return null;
    }
    const {passwordHash, ...user} = userData;
    return user;
}


export const getUserByEmail = async (email) => {
    const userData = await prisma.user.findUnique({
        where: { email }
    })
    if(!userData) {
        return null;
    }
    const {passwordHash, ...user} = userData;
    return user;
} 

export const getUserByPhoneNumber = async (phoneNumber) =>{
    const userData = await prisma.user.findUnique({
        where: { phoneNumber }
    })
    if(!userData) {
        return null;
    }
    const {passwordHash, ...user} = userData;
    return user;
}

export const getUserProfile = async (id) => {
    const userData = await prisma.user.findUnique({
        where: { id },
        include:{
            kycVerification:true,
            mobileMoneyAccounts:true,
        }
    })
    if(!userData) {
        return null;
    }
    const {passwordHash, ...user} = userData;
    return user;
}