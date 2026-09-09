import { ApiProperty } from "@nestjs/swagger";
import { ResponseMessage } from "../../common/interfaces/responseMessage.interface";

export abstract class BaseType implements ResponseMessage {

    @ApiProperty({ type: String, example: 'Product created successfully' })
    message: string;

    @ApiProperty({ type: Number, example: 201 })
    statusCode: number;
}