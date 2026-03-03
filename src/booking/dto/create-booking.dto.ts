import { IsInt, IsDateString, IsString, IsUUID, Min } from 'class-validator';

export class CreateBookingDto {
  @IsUUID()
  locationId: string;

  @IsString()
  department: string;

  @IsInt()
  @Min(1)
  attendees: number;

  @IsDateString()
  startTime: string;

  @IsDateString()
  endTime: string;
}
